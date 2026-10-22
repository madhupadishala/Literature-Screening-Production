import { redirect } from "next/navigation";

// The former static tenant registry was demonstration data, not tenant authority.
export default function TenantManagementPage() {
  redirect("/login");
}
