import type { Metadata } from 'next';
import { ChatPanel } from '@/components/chat/chat-panel';

export const metadata: Metadata = {
  title: 'Assistant — Appointly',
};

export default function ChatPage() {
  return <ChatPanel />;
}
