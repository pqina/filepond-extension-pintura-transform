import type {
    ImageSource,
    PinturaDefaultImageWriterResult,
    PinturaEditor,
    PinturaImageState,
} from '@pqina/pintura';
import type { TransformExtensionOptions } from 'filepond/extensions/common/createTransformExtension.js';
import { createTransformExtension } from 'filepond';
import { isFileEntry } from 'filepond/utils';

/**
 * Custom options for the Pintura Transform extension
 */
export interface PinturaTransformOptions extends TransformExtensionOptions {
    loadEditor?: () => Promise<void>;
    openEditor: (src: ImageSource) => Promise<PinturaEditor> | PinturaEditor;
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
        // The `canTransformEntry` is called to test if we can transform an image
        // Here we use a cheap, but not always accurate, method to test if an entry can be transformed
        canTransformEntry: (entry) => {
            return !!(isFileEntry(entry) && entry.type && /video|image/.test(entry.type));
        },

        // Use the `prepareTransformEntry` hook to preload dependencies
        prepareTransformEntry: async (entry, { onprogress, signal }) => {
            const { loadEditor } = props;
            await loadEditor?.();
        },

        // The `transformEntry` function is called when we're ready to transform an entry
        transformEntry: async (entry, { onprogress, signal }) => {
            // open the editor
            const { openEditor } = props;

            if (!openEditor) {
                throw new Error('openEditor function missing');
            }

            // Get props
            const { file, extension } = entry;
            const { input, history = [] } = <{ input: any; history: PinturaImageState[] }>(
                extension[extensionName]
            );

            // Determine which file to edit
            const src = input || file;

            // Open the file in the editor
            const editor = await openEditor(src);

            // Restore any previously stored history state
            if (history.length) {
                editor.on('load', () => {
                    editor.history.write(history.pop());
                });
            }

            // Returns the edited file and its image state
            const res = await process(editor);

            // clean up the editor
            editor.destroy();

            // User closed the editor
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
