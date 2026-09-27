import type { Metadata } from "next";
import { ChatScreen } from "@/features/chat/ChatScreen";

export const metadata: Metadata = {
  title: "AI 상담", // 원문: ChatView.swift:51
};

export default function Page() {
  return <ChatScreen />;
}
