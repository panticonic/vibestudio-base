/**
 * The commit of natlang's llama.cpp fork (werg/llama.cpp-neuralese, NATLANG_FORK.md there) that `natlang runtime build`
 * compiles: decision scoring, guided generation, native state spans, RL capture and backend sampling on top of
 * upstream. A build is identified by this exact commit, not by its build number.
 */
export declare const LLAMA_FORK_SOURCE: Readonly<{
    repository: "werg/llama.cpp-neuralese";
    branch: "neuralese";
    commit: "a6401bbd37529eda6b94e38d8ab63a35647c5204";
}>;
