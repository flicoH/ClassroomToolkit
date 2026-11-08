import { expectTypeOf, it } from "vitest";
import type { ReportSummaryItem } from "./types";

it("accepts subject report course scope from the nullable API field or older summaries", () => {
  expectTypeOf<ReportSummaryItem>().toHaveProperty("courseScope").toEqualTypeOf<string | null | undefined>();
});
