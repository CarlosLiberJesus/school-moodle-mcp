import {
  jest,
  describe,
  test,
  expect,
  beforeEach,
  beforeAll,
} from "@jest/globals";
// Original MoodleApiClient import for type information if MoodleApiClientType is not enough
import type { MoodleApiClient as MoodleApiClientType } from "../moodle/moodle_api_client.js";
import type { MoodleSection } from "../moodle/moodle_types.js"; // Added MoodleSection import
// @ts-expect-error TS2307
import type { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types"; // Reverted static type import and added ts-expect-error

// Define a Jest mock function for getCourseContents
const mockGetCourseContents =
  jest.fn<(courseId: number) => Promise<MoodleSection[]>>(); // Explicitly typed
const mockGetCourses = jest.fn();
const mockGetPageModuleContentByUrl = jest.fn();
const mockGetResourceFileContent = jest.fn();
const mockGetActivityDetails = jest.fn();
const mockGetAssignmentDetails = jest.fn();
const mockGetForumDiscussions = jest.fn();

// Manually mock the MoodleApiClient module
jest.unstable_mockModule("../moodle/moodle_api_client.js", () => ({
  MoodleApiClient: jest.fn().mockImplementation(() => ({
    getCourseContents: mockGetCourseContents,
    getCourses: mockGetCourses,
    getPageModuleContentByUrl: mockGetPageModuleContentByUrl,
    getResourceFileContent: mockGetResourceFileContent,
    getActivityDetails: mockGetActivityDetails,
    getAssignmentDetails: mockGetAssignmentDetails,
    getForumDiscussions: mockGetForumDiscussions,
  })),
}));

// Dynamically import MoodleMCP *after* the mocks have been set up
// This is crucial for ESM mocks to apply correctly.
let mcpServer: any; // Use 'any' or a more specific type if MoodleMCP can be typed before import
let MoodleMCPServerClass: any; // To store the dynamically imported class

beforeAll(async () => {
  // Import MoodleMCP after mocks are registered
  const MoodleMCPModule = await import("../src/mcp_server.js");
  MoodleMCPServerClass = MoodleMCPModule.MoodleMCP;
  // Note: We don't need to dynamically import MockedMoodleApiClient here for assignment
  // as jest.unstable_mockModule already replaces the module in the import system.
  // We use the mock functions (e.g., mockGetCourseContents) directly.
});

beforeEach(async () => {
  // Clear mock history before each test
  mockGetCourseContents.mockClear();
  mockGetCourses.mockClear();
  mockGetPageModuleContentByUrl.mockClear();
  mockGetResourceFileContent.mockClear();
  mockGetActivityDetails.mockClear();
  mockGetAssignmentDetails.mockClear();
  mockGetForumDiscussions.mockClear();

  // Re-initialize MoodleMCP with the dynamically imported class
  mcpServer = new MoodleMCPServerClass();
});

describe("MoodleMCP - get_course_activities Tool (with unstable_mockModule)", () => {
  test("Test Case 1: Successful retrieval of activities", async () => {
    const course_id = 1;
    const test_token = "test_token";

    // Correctly typed mock data for MoodleSection[]
    const mockCourseContentsData: MoodleSection[] = [
      {
        id: 1,
        name: "Section 1",
        summary: "",
        summaryformat: 1,
        visible: 1,
        sectionnumber: 1,
        hiddenbynumsections: 0,
        uservisible: true,
        modules: [
          {
            id: 101,
            name: "Activity 1",
            url: "http://moodle.example.com/mod/assign/view.php?id=101",
            timemodified: 1678886400,
            modname: "assign",
            instance: 1,
            description: "",
            visible: 1,
            uservisible: true,
            visibleoncoursepage: 1,
            modicon: "",
            modplural: "Assignments",
            availabilityinfo: null,
            indent: 0,
            completion: 0,
            contents: [],
            noviewlink: false,
          },
          {
            id: 102,
            name: "Activity 2",
            url: "http://moodle.example.com/mod/quiz/view.php?id=102",
            timemodified: 1678972800,
            modname: "quiz",
            instance: 2,
            description: "",
            visible: 1,
            uservisible: true,
            visibleoncoursepage: 1,
            modicon: "",
            modplural: "Quizzes",
            availabilityinfo: null,
            indent: 0,
            completion: 0,
            contents: [],
            noviewlink: false,
          },
        ],
      },
    ];

    // Set up the mock behavior for mockGetCourseContents
    mockGetCourseContents.mockImplementation(async (calledCourseId) => {
      if (calledCourseId === course_id) {
        // The console.log for raw module data should be here:
        console.log(
          "Raw module data from mock (to be processed by tool):",
          mockCourseContentsData[0].modules[0]
        );
        return Promise.resolve(mockCourseContentsData);
      }
      return Promise.resolve([]); // Default for other course_ids
    });

    const result = await mcpServer.callToolForTests("get_course_activities", {
      moodle_token: test_token,
      course_id: course_id,
    });

    expect(result).toEqual([
      {
        id: 101,
        name: "Activity 1",
        url: "http://moodle.example.com/mod/assign/view.php?id=101",
        timemodified: 1678886400,
      },
      {
        id: 102,
        name: "Activity 2",
        url: "http://moodle.example.com/mod/quiz/view.php?id=102",
        timemodified: 1678972800,
      },
    ]);

    // The assertion for the call should be on mockGetCourseContents
    expect(mockGetCourseContents).toHaveBeenCalledWith(course_id);
  });

  test("Test Case 2: Course with no activities/modules", async () => {
    const course_id = 2;
    const test_token = "test_token";
    const mockDataNoModules: MoodleSection[] = [
      // Typed
      {
        id: 1,
        name: "Section 1",
        summary: "",
        summaryformat: 1,
        visible: 1,
        sectionnumber: 1,
        hiddenbynumsections: 0,
        uservisible: true,
        modules: [],
      },
      {
        id: 2,
        name: "Section 2",
        summary: "",
        summaryformat: 1,
        visible: 1,
        sectionnumber: 2,
        hiddenbynumsections: 0,
        uservisible: true,
        modules: [],
      },
    ];
    mockGetCourseContents.mockResolvedValue(mockDataNoModules);

    const result = await mcpServer.callToolForTests("get_course_activities", {
      moodle_token: test_token,
      course_id: course_id,
    });

    expect(result).toEqual([]);
    expect(mockGetCourseContents).toHaveBeenCalledWith(course_id);
  });

  test("Test Case 3: Course with no sections", async () => {
    const course_id = 3;
    const test_token = "test_token";
    mockGetCourseContents.mockResolvedValue([]); // Empty array is a valid MoodleSection[]

    const result = await mcpServer.callToolForTests("get_course_activities", {
      moodle_token: test_token,
      course_id: course_id,
    });

    expect(result).toEqual([]);
    expect(mockGetCourseContents).toHaveBeenCalledWith(course_id);
  });

  test("Test Case 4: Invalid course_id (Moodle API error simulation)", async () => {
    const course_id = 999;
    const test_token = "test_token";
    // Ensure McpError and ErrorCode are available (imported at the top)
    const { McpError, ErrorCode } = await import(
      "@modelcontextprotocol/sdk/types.js"
    ); // Added ts-expect-error

    mockGetCourseContents.mockRejectedValue(
      new McpError(
        ErrorCode.InvalidRequest,
        "Simulated Moodle API error: Course not found"
      )
    );

    await expect(
      mcpServer.callToolForTests("get_course_activities", {
        moodle_token: test_token,
        course_id: course_id,
      })
    ).rejects.toThrow(McpError);

    // Optionally, check the specific error details
    try {
      await mcpServer.callToolForTests("get_course_activities", {
        moodle_token: test_token,
        course_id: course_id,
      });
    } catch (e: any) {
      expect(e.code).toEqual(ErrorCode.InvalidRequest);
      expect(e.message).toContain(
        "Simulated Moodle API error: Course not found"
      );
    }
    expect(mockGetCourseContents).toHaveBeenCalledWith(course_id);
  });

  test("Test Case 5: Modules with missing optional fields (url, timemodified)", async () => {
    const course_id = 4;
    const test_token = "test_token";
    const mockDataMissingFields: MoodleSection[] = [
      // Typed
      {
        id: 1,
        name: "Section 1",
        summary: "",
        summaryformat: 1,
        visible: 1,
        sectionnumber: 1,
        hiddenbynumsections: 0,
        uservisible: true,
        modules: [
          // Module 1: URL is now undefined
          {
            id: 201,
            name: "Activity With Null URL",
            url: undefined,
            timemodified: 1678886400,
            modname: "assign",
            instance: 1,
            description: "",
            visible: 1,
            uservisible: true,
            visibleoncoursepage: 1,
            modicon: "",
            modplural: "Assignments",
            availabilityinfo: null,
            indent: 0,
            completion: 0,
            contents: [],
            noviewlink: false,
          },
          // Module 2: URL is undefined, timemodified is undefined
          {
            id: 202,
            name: "Activity With Undefined Fields",
            modname: "quiz",
            instance: 2,
            description: "",
            visible: 1,
            uservisible: true,
            visibleoncoursepage: 1,
            modicon: "",
            modplural: "Quizzes",
            availabilityinfo: null,
            indent: 0,
            completion: 0,
            contents: [],
            noviewlink: false,
            url: undefined,
            timemodified: undefined,
          }, // Explicitly undefined for clarity
        ],
      },
    ];
    mockGetCourseContents.mockResolvedValue(mockDataMissingFields);

    const result = await mcpServer.callToolForTests("get_course_activities", {
      moodle_token: test_token,
      course_id: course_id,
    });

    expect(result).toEqual([
      {
        id: 201,
        name: "Activity With Null URL",
        url: null,
        timemodified: 1678886400,
      },
      {
        id: 202,
        name: "Activity With Undefined Fields",
        url: null,
        timemodified: 0,
      },
    ]);
    expect(mockGetCourseContents).toHaveBeenCalledWith(course_id);
  });
});
