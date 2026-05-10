import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { FeeScheduleTable } from "@/components/marketing/fee-schedule";
import { VolumeProgress } from "@/components/marketing/volume-progress";

export const metadata = {
  title: "Fee Schedule — Gideon Tasks",
  description:
    "Published Gideon fee staircase. The platform fee steps down as cumulative volume grows, from 5% at launch toward 1% at $200M+ in volume.",
};

export default function FeesPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fees</h1>
          <p className="mt-2 text-gray-600">
            Gideon Tasks charges one platform fee per transaction. The fee
            steps down as cumulative platform volume grows. Stripe&apos;s
            processing fee is passed through transparently — never marked up.
          </p>
        </div>
        <VolumeProgress />
        <FeeScheduleTable />
      </main>
      <Footer />
    </div>
  );
}
