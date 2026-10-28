import OwnerAccountActivation from "@/components/owner-account-activation";

export default async function OwnerActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return <OwnerAccountActivation initialToken={token} />;
}
