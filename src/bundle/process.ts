
import {
	SEP as pathSeparator
} from "https://deno.land/std@0.114.0/path/mod.ts";

import {
	CallExpression,
	parse as parseLua,
	StringCallExpression,
} from '../dep.ts'

import {Module, ModuleMap} from './module.ts'

import {reverseTraverseRequires} from '../ast/index.ts'

import {RealizedOptions} from './options.ts'
import {readMetadata} from '../metadata/index.ts'

import ModuleBundlingError from '../errors/ModuleBundlingError.ts'
import ModuleResolutionError from '../errors/ModuleResolutionError.ts'

type ResolvedModule = {
	name: string,
	resolvedPath: string,
}

export function resolveModule(name: string, packagePaths: readonly string[]) {
	const platformName = name.replace(/\./g, pathSeparator)

	for (const pattern of packagePaths) {
		const path = pattern.replace(/\?/g, platformName)
		
		try {
			if (Deno.lstatSync(path).isFile) {
				return path
			}
		} catch (_error) {
			//do nothing - does not exist
		}
	}
	return null
}

export function processModule(module: Module, options: RealizedOptions, processedModules: ModuleMap): void {
	let content = options.preprocess ? options.preprocess(module, options) : module.content

	const resolvedModules: ResolvedModule[] = []

	// Ensure we don't attempt to load modules required in nested bundles
	if (!readMetadata(content)) {
		const ast = parseLua(content, {
			locations: true,
			luaVersion: options.luaVersion,
			ranges: true,
		})

		reverseTraverseRequires(ast, expression => {
			const argument = (expression as StringCallExpression).argument || (expression as CallExpression).arguments[0]

			let required = null

			if (argument.type == 'StringLiteral') {
				required = argument.value
			} else if (options.expressionHandler) {
				required = options.expressionHandler(module, argument)
			}

			if (required) {
				const requiredModuleNames: string[] = Array.isArray(required) ? required : [required]

				for (const requiredModule of requiredModuleNames) {
					const resolvedPath = resolveModule(requiredModule, options.paths)

					if (!resolvedPath) {
						const start = expression.loc?.start!
						throw new ModuleResolutionError(requiredModule, module.name, start.line, start.column)
					}

					resolvedModules.push({
						name: requiredModule,
						resolvedPath,
					})
				}

				if (typeof required === "string") {
					const range = expression.range!
					const baseRange = expression.base.range!
					content = content.slice(0, baseRange[1]) + '("' + required + '")' + content.slice(range[1])
				}
			}
		})
	}

	processedModules[module.name] = {
		...module,
		content,
	}

	for (const resolvedModule of resolvedModules) {
		if (processedModules[resolvedModule.name]) {
			continue
		}

		try {
			const moduleContent = new TextDecoder('utf-8').decode(Deno.readFileSync(resolvedModule.resolvedPath))
			processModule({
				...resolvedModule,
				content: moduleContent
			}, options, processedModules)
		} catch (e) {
			throw new ModuleBundlingError(resolvedModule.name, e)
		}
	}
}
