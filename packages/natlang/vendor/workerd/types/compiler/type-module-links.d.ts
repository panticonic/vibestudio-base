/** Link explicit type imports/re-exports using the compiler's parser, leaving
 * runtime imports, comments and source text that merely mentions an import alone.
 */
export declare function rewriteTypeModuleSpecifiers(source: string, resolve: (specifier: string) => string | undefined, fileName?: string): string;
