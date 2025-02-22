import { ChatBridgeEvents } from '../ChatBridge';
import type { ChatBridge } from '../ChatBridge';

/**
 * @param chatBridge
 * @param error
 */
export default function (chatBridge: ChatBridge, error: Error) {
	chatBridge.emit(ChatBridgeEvents.ERROR, error);
}
