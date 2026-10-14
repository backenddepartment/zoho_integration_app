import { LoadingScreen } from "@/components/loading-screen";

// Shown straight away while this page's data loads.
export default function Loading() {
  return <LoadingScreen title="Opening Deleted items" steps={["Connecting", "Searching", "Sorting", "Ready"]} />;
}
