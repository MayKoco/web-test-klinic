import { SubscriptionTicket } from "@/components/subscription-ticket";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SubscriptionTicket id={id} />;
}
