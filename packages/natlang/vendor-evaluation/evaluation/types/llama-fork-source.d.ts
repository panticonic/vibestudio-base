/**
 * The commit of natlang's llama.cpp fork (werg/llama.cpp-neuralese, NATLANG_FORK.md there) that `natlang runtime build`
 * compiles: decision scoring, guided generation, native state spans, RL capture and backend sampling on top of
 * upstream. A build is identified by this exact commit, not by its build number.
 */
export declare const LLAMA_FORK_SOURCE: Readonly<{
    repository: "werg/llama.cpp-neuralese";
    branch: "neuralese";
    commit: "e8552cc50c00525b55f3c2063f089bb9dd8c8087";
}>;
