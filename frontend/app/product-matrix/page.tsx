import Link from "next/link";
import ApplicationShell from "@/components/enterprise/ApplicationShell";
import OperationalScreenHeader from "@/components/enterprise/OperationalScreenHeader";
import TenantConfigurationConsole from "@/components/admin/TenantConfigurationConsole";
import {Notice} from "@/components/ui/Notice";
import {Card} from "@/components/ui/Card";
export default function ProductMatrixPage(){
 return <ApplicationShell>
  <OperationalScreenHeader compact eyebrow="NEXUS · Product Matrix" title="Product Master & Matrix Foundation"
    description="Reuse the governed effective-dated Product Master and MAH configuration lifecycle." status="Configuration governed"/>
  <Notice>The current backend has a versioned Product Master configuration service but no product × country × obligation status ledger, regulatory deadline rules, calendar scheduling or obligation update APIs. No compliance status is inferred from Product Master alone.</Notice>
  <Card><strong>Governed Product Master</strong><p>Configure product identity, synonyms, formulation, market, MAH, licensing and WHODrug mappings using the existing authorization and audit workflow.</p>
   <p><Link href="/admin/products">Open dedicated Product Master administration</Link></p>
  </Card>
  <TenantConfigurationConsole/>
 </ApplicationShell>;
}
