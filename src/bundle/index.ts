import {
	resolve as resolvePath,
	fromFileUrl,
	dirname
} from "https://deno.land/std@0.114.0/path/mod.ts";

import {
	Module,
	ModuleMap,
} from './module.ts'

import {defaultOptions, Options, RealizedOptions} from './options.ts'

import {processModule} from './process.ts'
import {generateMetadata} from '../metadata/index.ts'

function mergeOptions(options: Options): RealizedOptions {
	return {
		...defaultOptions,
		...options,
		identifiers: {
			...defaultOptions.identifiers,
			...options.identifiers,
		}
	} as RealizedOptions
}

function bundleModule(module: Module, options: RealizedOptions) {
	const postprocessedContent = options.postprocess ? options.postprocess(module, options) : module.content
	const identifiers = options.identifiers
	return `${identifiers.register}("${module.name}", function(require, _LOADED, ${identifiers.register}, ${identifiers.modules})\n${postprocessedContent}\nend)\n`
}

export function bundleString(lua: string, options: Options = {}): string {
	const realizedOptions = mergeOptions(options)
	const processedModules: ModuleMap = {}

	processModule({
		name: realizedOptions.rootModuleName,
		content: lua,
	}, realizedOptions, processedModules)

	if (Object.keys(processedModules).length === 1 && !realizedOptions.force) {
		return lua
	}

	const identifiers = realizedOptions.identifiers
	const runtime = Deno.readFileSync(resolvePath(dirname(fromFileUrl(import.meta.url)), './runtime.lua'))

	let bundle = ''

	if (realizedOptions.metadata) {
		bundle += generateMetadata(realizedOptions)
	}

	bundle += `local ${identifiers.require}, ${identifiers.loaded}, ${identifiers.register}, ${identifiers.modules} = ${runtime}`
	bundle += realizedOptions.isolate ? '(nil)\n' : '(require)\n'

	for (const [name, processedModule] of Object.entries(processedModules)) {
		bundle += bundleModule({
			name,
			content: processedModule.content!
		}, realizedOptions)
	}

	bundle += 'return ' + identifiers.require + '("' + realizedOptions.rootModuleName + '")'

	return bundle
}

export function bundle(inputFilePath: string, options: Options = {}): string {
	const lua = new TextDecoder('utf-8').decode(Deno.readFileSync(inputFilePath))
	return bundleString(lua, options)
}
