import type {
    ImageSource,
    PinturaDefaultImageWriterResult,
    PinturaEditor,
    PinturaImageState,
} from '@pqina/pintura';
import type { TransformExtensionOptions } from 'filepond/extensions/common/createTransformExtension.js';
import { createTransformExtension, FilePondEntry, Progress } from 'filepond';
import { isFile, isFileEntry } from 'filepond/utils';

/**
 * Custom options for the Pintura Transform extension
 */
export interface PinturaTransformOptions extends TransformExtensionOptions {
    prepare?: (
        entry: FilePondEntry,
        options: { onprogress: (e: Progress) => void; signal: AbortSignal }
    ) => Promise<void>;
    transform: (
        src: ImageSource,
        entry: FilePondEntry,
        options: { onprogress: (e: Progress) => void; signal: AbortSignal }
    ) => Promise<File | PinturaEditor> | File | PinturaEditor;
}

/**
 * Asyncify the pintura process call
 */
function process(editor: PinturaEditor): Promise<PinturaDefaultImageWriterResult | void> {
    return new Promise((resolve) => {
        editor.on('process', resolve);
        editor.on('close', () =>
            // We don't return a result on close
            resolve()
        );
    });
}

export const PinturaTransform = createTransformExtension({
    name: 'PinturaTransform',
    props: {
        actionTransform: 'editMedia',
    } as PinturaTransformOptions,
    factory: ({ extensionName, props }) => ({
        // The `canTransformEntry` is called to test if we can transform an image, here we use a cheap, but not always accurate, method to test if an entry can be transformed
        canTransformEntry: (entry) => {
            return !!(isFileEntry(entry) && entry.type && /video|image/.test(entry.type));
        },

        // Use the `prepareTransformEntry` hook to preload dependencies
        prepareTransformEntry: async (entry, { onprogress, signal }) => {
            const { prepare } = props;
            await prepare?.(entry, { onprogress, signal });
        },

        // The `transformEntry` function is called when we're ready to transform an entry
        transformEntry: async (entry, { onprogress, signal }) => {
            // open the editor
            const { transform } = props;

            if (!open) {
                throw new Error('openEditor function missing');
            }

            // Get props
            const { file, extension } = entry;
            const { input, history = [] } = <{ input: any; history: PinturaImageState[] }>(
                extension[extensionName]
            );

            // Determine which file to edit
            const src = input || file;

            // Open the file in the editor, expects a File or a Pintura instance in return
            const transformResult = await transform(src, entry, { onprogress, signal });
            if (!transformResult) {
                throw new Error(`Transform didn't return a result`);
            }

            // file returned, let's update the file item
            if (isFile(transformResult)) {
                return {
                    file: transformResult,
                };
            }

            // editor instance returned, let's wait for the manual editing to complete
            const pinturaInstance = transformResult;

            // Restore any previously stored history state
            if (history.length) {
                pinturaInstance.on('load', () => {
                    pinturaInstance.history.write(history.pop());
                });
            }

            // clean up the editor
            pinturaInstance.destroy();

            // Returns the edited file and its image state
            const res = await process(transformResult);

            // User closed the editor, no changes
            if (!res) {
                return;
            }

            // Return transformed file and optionally update history
            return {
                file: res.dest,
                history: [...history, res.imageState],
            };
        },
    }),
});

declare module 'filepond' {
    interface FilePondElement {
        PinturaTransform: PinturaTransformOptions;
    }
    interface DefineFilePondOptions {
        PinturaTransform?: PinturaTransformOptions;
    }
}
