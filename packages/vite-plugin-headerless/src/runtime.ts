/// <reference path="../client.d.ts" />
import { AssetRestorer } from 'headerless'
import { fragments, key } from 'virtual:headerless'

/**
 * App-side entry point, pre-wired to the fragment map this plugin injects:
 *
 *   import { assetRestorer } from 'vite-plugin-headerless/runtime'
 *   img.src = await assetRestorer.ensure('assets/story/cg.webp')
 *
 * During dev the virtual module serves an empty map, so every call is a
 * pass-through returning the input path. See AssetRestorer in `headerless`
 * for the full contract (caching, prefetch, no-throw fallback).
 */
export const assetRestorer = new AssetRestorer({ fragments, key })

export type { RestorerInit, SerializedFragment } from 'headerless'
