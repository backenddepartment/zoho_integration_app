import { LoadingScreen } from "@/components/loading-screen";

// Shown straight away while this page's data loads.
export default function Loading() {
  return <LoadingScreen title="Opening" steps={["Opening", "Access", "Files", "Preparing", "Done"]} />;
}
