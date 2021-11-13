import {ModuleMap} from './module.ts'

import {defaultMetadata, Metadata, readMetadata, RealizedMetadata} from '../metadata/index.ts'
import {Options, RealizedOptions} from './options.ts'

import {processModules} from './process.ts'

import MalformedBundleError from '../errors/MalformedBundleError.ts'
import NoBundleMetadataError from '../errors/NoBundleMetadataError.ts'

export type UnbundledData = {
	metadata: RealizedMetadata,
	modules: ModuleMap,
}

const defaultOptions: RealizedOptions = {
	rootOnly: false,
}

function mergeOptions(options: Options): RealizedOptions {
	return {
		...defaultOptions,
		...options,
	}
}

function mergeMetadata(metadata: Metadata): RealizedMetadata {
	return {
		...defaultMetadata,
		...metadata,
		identifiers: {
			...defaultMetadata.identifiers,
			...metadata.identifiers,
		}
	} as RealizedMetadata
}

export function unbundleString(lua: string, options: Options = {}): UnbundledData {
	const metadata = readMetadata(lua)

	if (!metadata) {
		throw new NoBundleMetadataError()
	}

	const realizedOptions = mergeOptions(options)
	const realizedMetadata = mergeMetadata(metadata)

	const modules = processModules(lua, realizedMetadata, realizedOptions)
	const rootModule = modules[realizedMetadata.rootModuleName]

	if (!rootModule) {
		throw new MalformedBundleError(`Root module '${realizedMetadata.rootModuleName}' not found.`)
	}

	return {
		metadata: realizedMetadata,
		modules,
	}
}

export function unbundle(inputFilePath: string, options: Options = {}): UnbundledData {
	const lua = new TextDecoder('utf-8').decode(Deno.readFileSync(inputFilePath))
	return unbundleString(lua, options)
}
