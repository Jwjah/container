import { useEffect } from 'react';
import { useFileHandler } from '@app/contexts/file/fileHooks';

export default function PostMessageListener() {
  const { addFiles } = useFileHandler();

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Allow any origin for testing, or restrict it in production
      if (event.data?.type === 'LOAD_FILE' && event.data.file) {
        try {
          console.log('[PostMessageListener] Received LOAD_FILE', event.data.file);
          // addFiles expects an array of File objects
          await addFiles([event.data.file]);
        } catch (err) {
          console.error('[PostMessageListener] Failed to load file from postMessage', err);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [addFiles]);

  return null;
}
