import { MessageTarget } from '@/common/message-types';
import { handleGifMessage } from './gif-encoder';
import { initKeepalive } from './rr-keepalive';

// Initialize RR V3 Keepalive
initKeepalive();

interface OffscreenMessage {
  target: MessageTarget | string;
  type: string;
}

type MessageResponse = {
  error?: string;
};

// Listen for messages from the extension
chrome.runtime.onMessage.addListener(
  (
    message: OffscreenMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void,
  ) => {
    if (message.target !== MessageTarget.Offscreen) {
      return;
    }

    // Handle GIF encoding messages
    if (handleGifMessage(message, sendResponse)) {
      return true;
    }

    sendResponse({ error: `Unknown message type: ${message.type}` });
    return true;
  },
);

console.log('Offscreen: Message handler loaded');
