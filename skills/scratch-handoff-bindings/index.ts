import type {
  FileHandle,
  RuntimeFs,
} from "../../packages/runtime/src/types.js";
import type {
  HandoffRequest,
  ScratchReceipt,
  SourceRead,
} from "../scratch-handoff/types.js";

const maxSourceBytes = 24 * 1024;
const maxArtifactBytes = 64 * 1024;

type ScratchFs = Pick<RuntimeFs, "mkdtemp" | "rename" | "rm"> & {
  writeFile(path: string, data: string): Promise<void>;
  open(
    path: string,
    flags: string,
  ): Promise<
    Pick<FileHandle, "read" | "close"> & {
      stat(): Promise<{ isFile(): boolean }>;
    }
  >;
};

async function readBytes(
  fs: ScratchFs,
  path: string,
  limit: number,
): Promise<Uint8Array> {
  const handle = await fs.open(path, "r");
  try {
    if (!(await handle.stat()).isFile())
      throw new Error("Expected a text file.");
    const bytes = new Uint8Array(limit + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > limit)
      throw new Error("The text file exceeds its byte limit.");
    return bytes.subarray(0, offset);
  } finally {
    await handle.close();
  }
}

/** Bind the current workspace's runtime filesystem and a single caller-owned assignment. */
export function bindScratchHandoff(
  fs: ScratchFs,
  request: HandoffRequest,
  readBounded: (path: string, limit: number) => Promise<Uint8Array> = (
    path,
    limit,
  ) => readBytes(fs, path, limit),
) {
  const paths = new Map(request.sources.map(({ id, path }) => [id, path]));
  if (
    !request.goal.trim() ||
    !request.questions.length ||
    request.questions.length > 8 ||
    request.questions.some(
      (question) => !question.trim() || question.length > 256,
    ) ||
    !paths.size ||
    paths.size > 8 ||
    paths.size !== request.sources.length ||
    request.sources.some(({ id, path }) => !id.trim() || !path.trim())
  )
    throw new Error(
      "Assign one to eight uniquely identified files and one to eight bounded questions.",
    );

  let staged: {body:string;receipt:ScratchReceipt}|undefined;
  let pending: {body:string;promise:Promise<ScratchReceipt|null>}|undefined;
  return {
    scratchHandoffRead: {
      async read(id: string): Promise<SourceRead | null> {
        const path = paths.get(id);
        if (!path) return null;
        try {
          const bytes = await readBounded(path, maxSourceBytes);
          if (bytes.length > maxSourceBytes) return null;
          const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          if (text.includes("\0")) return null;
          const lines = text.split(/\r?\n/u);
          if (lines.at(-1) === "") lines.pop();
          return { id, lines };
        } catch {
          return null;
        }
      },
    },
    scratchHandoffWrite: {
      async stage(body: string): Promise<ScratchReceipt | null> {
        const expected = new TextEncoder().encode(body);
        if (!expected.length || expected.length > maxArtifactBytes)return null;
        if(staged){
          if(staged.body!==body)return null;
          try{
            const actual=await readBounded(staged.receipt.path,expected.length);
            return actual.length===expected.length&&actual.every((byte,index)=>byte===expected[index])?{...staged.receipt}:null;
          }catch{return null;}
        }
        if(pending)return pending.body===body?await pending.promise:null;
        const perform=async():Promise<ScratchReceipt|null>=>{
        let directory: string | undefined;
        try {
          directory = await fs.mkdtemp("evidence-handoff");
          const pending = `${directory}/.pending`;
          const path = `${directory}/handoff.json`;
          await fs.writeFile(pending, body);
          await fs.rename(pending, path);
          const actual = await readBounded(path, expected.length);
          if (
            actual.length === expected.length &&
            actual.every((byte, index) => byte === expected[index])
          ) {
            return { path, bytes: actual.length };
          }
        } catch {
          // A failed operation has no verified receipt.
        }
        if (directory)
          await fs
            .rm(directory, { recursive: true, force: true })
            .catch(() => {});
        return null;
        };
        const promise=perform();pending={body,promise};
        try{
          const receipt=await promise;
          if(receipt)staged={body,receipt:{...receipt}};
          return receipt;
        }finally{pending=undefined;}
      },
    },
  };
}
