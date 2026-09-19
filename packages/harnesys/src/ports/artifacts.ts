export type SendFile =
  | {
      path: string;
      name?: string;
      mediaType?: string;
    }
  | {
      bytes: Uint8Array;
      name?: string;
      mediaType?: string;
    };
export type ArtifactStore = {
  put(input: SendFile):
    | Promise<{
        uri: string;
      }>
    | {
        uri: string;
      };
  read(uri: string):
    | Promise<{
        bytes: Uint8Array;
        mediaType?: string;
      }>
    | {
        bytes: Uint8Array;
        mediaType?: string;
      };
};
