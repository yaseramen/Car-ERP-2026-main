import { MarketingPageBackdrop } from "@/components/marketing/marketing-page-backdrop";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-[100dvh] flex items-center justify-center bg-gray-950/5">
      <MarketingPageBackdrop />
      <div className="relative z-10 w-full">{children}</div>
    </div>
  );
}
