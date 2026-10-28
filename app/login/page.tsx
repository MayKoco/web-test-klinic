import ClinicWorkbench from "@/components/clinic-workbench";
import { clinicSubdomainFromHostname } from "@/lib/tenant-host";
import { headers } from "next/headers";

export default async function LoginPage() {
  const host = (await headers()).get("host")?.split(":")[0] ?? "";
  return (
    <ClinicWorkbench
      initialClinicSubdomain={clinicSubdomainFromHostname(host)}
    />
  );
}
