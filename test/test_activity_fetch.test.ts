import { MoodleMCP } from "../src/mcp_server.js";
import dotenv from "dotenv"; // Para carregar .env para testes
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar variáveis de ambiente específicas para teste, se necessário, ou usar as globais
dotenv.config({ path: path.resolve(__dirname, "../.env") }); // Ajuste o caminho para o seu .env

const MOODLE_TOKEN_FOR_TESTS = process.env.MOODLE_TOKEN_FOR_TESTS; // Usa o token do .env

if (!MOODLE_TOKEN_FOR_TESTS) {
  console.error(
    "MOODLE_TOKEN não encontrado no .env. Testes não podem prosseguir."
  );
  process.exit(1);
}

async function runAllTests() {
  try {
    const mcpServer = new MoodleMCP();

    console.log("Test 1.1: get_activity_details by activity_id");
    const detailsById = await mcpServer.callToolForTests(
      "get_activity_details",
      {
        moodle_token: MOODLE_TOKEN_FOR_TESTS,
        activity_id: 150,
      }
    );
    console.log("Result:", JSON.stringify(detailsById, null, 2));

    console.log(
      "\nTest 1.2: get_activity_details by course_name + activity_name"
    );
    const detailsByNames = await mcpServer.callToolForTests(
      "get_activity_details",
      {
        moodle_token: MOODLE_TOKEN_FOR_TESTS,
        course_id: 6,
        activity_name: "Componentes Fundamentais de um PC",
      }
    );
    console.log("Result:", JSON.stringify(detailsByNames, null, 2));

    console.log("\nTest 2.1: get_courses");
    const courses = await mcpServer.callToolForTests("get_courses", {
      moodle_token: MOODLE_TOKEN_FOR_TESTS,
      course_name_filter: null,
    });
    console.log("Courses:", JSON.stringify(courses, null, 2));

    console.log("\nTest 2.2: get_courses with course_name_filter");
    const filteredCourses = await mcpServer.callToolForTests("get_courses", {
      moodle_token: MOODLE_TOKEN_FOR_TESTS,
      course_name_filter: "Aplicações Informáticas B 12º Ano Cópia 1",
    });
    console.log("Filtered Courses:", JSON.stringify(filteredCourses, null, 2));

    console.log("\nTest 2.3: get_courses with course_name_filter for id 6");
    const filteredCoursesById = await mcpServer.callToolForTests(
      "get_courses",
      {
        moodle_token: MOODLE_TOKEN_FOR_TESTS,
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
      {
        moodle_token: MOODLE_TOKEN_FOR_TESTS,
        course_id: 6,
      }
    )) as unknown[];
    console.log("Course Contents:", JSON.stringify(courseContents[0], null, 2));

    console.log("\nTest 4: get_page_module_content");
    // Use a real page_content_url if available
    const pageContent = await mcpServer.callToolForTests(
      "get_page_module_content",
      {
        moodle_token: MOODLE_TOKEN_FOR_TESTS,
        page_content_url: "https://127.0.0.1/moodle/mod/assign/view.php?id=150",
      }
    );
    console.log("Page Content:", pageContent);

    console.log("\nTest 5: get_resource_file_content");
    // Use a real resource_file_url and mimetype if available
    const resourceContent = await mcpServer.callToolForTests(
      "get_resource_file_content",
      {
        moodle_token: MOODLE_TOKEN_FOR_TESTS,
        resource_file_url:
          "https://127.0.0.1/moodle/webservice/pluginfile.php/309/mod_resource/content/7/solucoes_11_12.pdf",
        mimetype: "pdf",
      }
    );
    console.log("Resource File Content:", resourceContent);

    console.log("\nTest 6.1: fetch_activity_content by activity_id");
    const fetchedContentById = await mcpServer.callToolForTests(
      "fetch_activity_content",
      {
        moodle_token: MOODLE_TOKEN_FOR_TESTS,
        activity_id: 150,
      }
    );
    console.log("Fetched Activity Content (by id):", fetchedContentById);

    console.log(
      "\nTest 6.2: fetch_activity_content by course_name + activity_name"
    );
    const fetchedContentByNames = await mcpServer.callToolForTests(
      "fetch_activity_content",
      {
        moodle_token: MOODLE_TOKEN_FOR_TESTS,
        course_id: 6,
        activity_name: "Componentes Fundamentais de um PC",
      }
    );
    console.log("Fetched Activity Content (by names):", fetchedContentByNames);

    console.log("\nTest 7: get_course_activities");
    // Usa um course_id válido do teu Moodle!
    const courseActivities = await mcpServer.callToolForTests(
      "get_course_activities",
      {
        moodle_token: MOODLE_TOKEN_FOR_TESTS,
        course_id: 6, // <-- substitui por um ID de curso válido no teu Moodle
      }
    );
    console.log(
      "Course Activities:",
      JSON.stringify(courseActivities, null, 2)
    );
  } catch (error) {
    console.error("Test failed:", error);
  }
}

runAllTests();
