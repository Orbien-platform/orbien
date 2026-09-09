// Testes de PequenosGruposClient — wrapper fino sobre authenticatedRequest.
// Cobre as 6 funções da task T4 (tasks.md), MOB-09-01/03/04/06/07.
const mockAuthenticatedRequest = jest.fn();
jest.mock("../auth/auth-client", () => ({
  authenticatedRequest: (...args: unknown[]) => mockAuthenticatedRequest(...args),
}));

import {
  getGroupRoster,
  getMeeting,
  listMaterials,
  listMeetings,
  listMyGroups,
  recordAttendance,
} from "./pequenos-grupos-client";

describe("PequenosGruposClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("listMyGroups", () => {
    it("chama GET /small-groups/mine", async () => {
      const groups = [{ id: "sg1" }];
      mockAuthenticatedRequest.mockResolvedValue(groups);

      const result = await listMyGroups();

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("get", "/small-groups/mine");
      expect(result).toEqual(groups);
    });
  });

  describe("listMeetings", () => {
    it("chama GET /small-groups/:groupId/meetings", async () => {
      const meetings = [{ id: "m1" }];
      mockAuthenticatedRequest.mockResolvedValue(meetings);

      const result = await listMeetings("sg1");

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("get", "/small-groups/sg1/meetings");
      expect(result).toEqual(meetings);
    });
  });

  describe("getMeeting", () => {
    it("chama GET /small-groups/meetings/:meetingId", async () => {
      const meeting = { id: "m1", attendanceRecords: [] };
      mockAuthenticatedRequest.mockResolvedValue(meeting);

      const result = await getMeeting("m1");

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("get", "/small-groups/meetings/m1");
      expect(result).toEqual(meeting);
    });
  });

  describe("listMaterials", () => {
    it("chama GET /small-groups/meetings/:meetingId/materials", async () => {
      const materials = [{ id: "mat1" }];
      mockAuthenticatedRequest.mockResolvedValue(materials);

      const result = await listMaterials("m1");

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        "get",
        "/small-groups/meetings/m1/materials",
      );
      expect(result).toEqual(materials);
    });
  });

  describe("getGroupRoster", () => {
    it("chama GET /small-groups/:groupId e mapeia memberships pro roster", async () => {
      mockAuthenticatedRequest.mockResolvedValue({
        memberships: [
          { role: "leader", person: { id: "p1", full_name: "Ana Líder" } },
          { role: "member", person: { id: "p2", full_name: "Bia Membro" } },
        ],
      });

      const result = await getGroupRoster("sg1");

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("get", "/small-groups/sg1");
      expect(result).toEqual([
        { person_id: "p1", full_name: "Ana Líder", role: "leader" },
        { person_id: "p2", full_name: "Bia Membro", role: "member" },
      ]);
    });
  });

  describe("recordAttendance", () => {
    it("chama POST /small-groups/meetings/:meetingId/attendance com person_ids", async () => {
      mockAuthenticatedRequest.mockResolvedValue({ added: 2 });

      const result = await recordAttendance("m1", ["p1", "p2"]);

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        "post",
        "/small-groups/meetings/m1/attendance",
        { body: { person_ids: ["p1", "p2"] } },
      );
      expect(result).toEqual({ added: 2 });
    });
  });
});
