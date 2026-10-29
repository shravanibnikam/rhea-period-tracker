// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { buildExport, downloadJSON } from "@/data/exporter";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("downloadJSON", () => {
  it("names the file by the local date and revokes its URL only after the download starts", () => {
    const tz = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-29T04:55:00Z")); // 21:55 on Oct 28 in Los Angeles
      const names: string[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        names.push(this.download);
      });
      URL.createObjectURL = vi.fn(() => "blob:backup");
      const revoke = vi.fn();
      URL.revokeObjectURL = revoke;

      downloadJSON(buildExport({ deviceId: "device", logs: [], meta: {} }));
      expect(names).toEqual(["rhea-backup-2026-10-28.json"]);
      expect(revoke).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(revoke).toHaveBeenCalledWith("blob:backup");
    } finally {
      process.env.TZ = tz;
    }
  });
});
