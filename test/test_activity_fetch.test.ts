import { MoodleMCP } from "../src/mcp_server.js";

// test/test_activity_fetch.test.ts

async function runAllTests() {
  try {
    const mcpServer = new MoodleMCP();

    console.log("Test 1.1: get_activity_details by activity_id");
    const detailsById = await mcpServer.callToolForTests(
      "get_activity_details",
      { activity_id: 150 }
    );
    console.log("Result:", JSON.stringify(detailsById, null, 2));

    console.log(
      "\nTest 1.2: get_activity_details by course_name + activity_name"
    );
    const detailsByNames = await mcpServer.callToolForTests(
      "get_activity_details",
      {
        course_id: 6,
        activity_name: "Componentes Fundamentais de um PC",
      }
    );
    console.log("Result:", JSON.stringify(detailsByNames, null, 2));

    console.log("\nTest 2.1: get_courses");
    const courses = await mcpServer.callToolForTests("get_courses", {});
    console.log("Courses:", JSON.stringify(courses, null, 2));

    console.log("\nTest 2.2: get_courses with course_name_filter");
    const filteredCourses = await mcpServer.callToolForTests("get_courses", {
      course_name_filter: "Aplicações Informáticas B 12º Ano Cópia 1",
    });
    console.log("Filtered Courses:", JSON.stringify(filteredCourses, null, 2));

    console.log("\nTest 2.3: get_courses with course_name_filter for id 6");
    const filteredCoursesById = await mcpServer.callToolForTests(
      "get_courses",
      {
        course_name_filter: "6",
      }
    );
    console.log(
      "Filtered Courses by id:",
      JSON.stringify(filteredCoursesById, null, 2)
    );

    console.log("\nTest 3: get_course_contents");
    // Use a valid course_id if known, else fallback to 2
    const courseContents = (await mcpServer.callToolForTests(
      "get_course_contents",
      { course_id: 6 }
    )) as unknown[];
    console.log("Course Contents:", JSON.stringify(courseContents[0], null, 2));

    console.log("\nTest 4: get_page_module_content");
    // Use a real page_content_url if available
    const pageContent = await mcpServer.callToolForTests(
      "get_page_module_content",
      {
        page_content_url: "https://127.0.0.1/moodle/mod/assign/view.php?id=150",
      }
    );
    console.log("Page Content:", pageContent);

    console.log("\nTest 5: get_resource_file_content");
    // Use a real resource_file_url and mimetype if available
    const resourceContent = await mcpServer.callToolForTests(
      "get_resource_file_content",
      {
        resource_file_url:
          "https://127.0.0.1/moodle/webservice/pluginfile.php/309/mod_resource/content/7/solucoes_11_12.pdf",
        mimetype: "pdf",
      }
    );
    console.log("Resource File Content:", resourceContent);

    console.log("\nTest 6.1: fetch_activity_content by activity_id");
    const fetchedContentById = await mcpServer.callToolForTests(
      "fetch_activity_content",
      { activity_id: 150 }
    );
    console.log("Fetched Activity Content (by id):", fetchedContentById);

    console.log(
      "\nTest 6.2: fetch_activity_content by course_name + activity_name"
    );
    const fetchedContentByNames = await mcpServer.callToolForTests(
      "fetch_activity_content",
      {
        course_id: 6,
        activity_name: "Componentes Fundamentais de um PC",
      }
    );
    console.log("Fetched Activity Content (by names):", fetchedContentByNames);
  } catch (error) {
    console.error("Test failed:", error);
  }
}

runAllTests();
