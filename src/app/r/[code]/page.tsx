import { notFound } from "next/navigation";
import { Room } from "@/components/Room";

export const metadata = { title: "Room · Cards Against Decency" };

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const c = code.toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(c)) notFound();
  return <Room code={c} />;
}
