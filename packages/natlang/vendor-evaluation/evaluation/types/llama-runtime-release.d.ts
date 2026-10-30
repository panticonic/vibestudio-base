export declare const LLAMA_RUNTIME_RELEASE: Readonly<{
    version: string;
    build: number;
    commit: string;
    compatible: {
        minimumVersion: string;
        maximumVersionExclusive: string;
        minimumBuild: number;
    };
    artifacts: ({
        key: string;
        platform: "linux";
        arch: string;
        backend: "cpu";
        archive: "tar.gz";
        url: string;
        bytes: number;
        sha256: string;
    } | {
        key: string;
        platform: "darwin";
        arch: string;
        backend: "metal";
        archive: "tar.gz";
        url: string;
        bytes: number;
        sha256: string;
    } | {
        key: string;
        platform: "win32";
        arch: string;
        backend: "cpu";
        archive: "zip";
        url: string;
        bytes: number;
        sha256: string;
    })[];
}>;
