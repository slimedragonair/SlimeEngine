#include "tests/test_macros.h"

TEST_FORCE_LINK(test_slime_ai_p05_provider_wire)

#include "core/io/dir_access.h"
#include "core/os/os.h"
#include "editor/slime_ai/slime_ai_run_controller.h"
#include "editor/slime_ai/slime_ai_scene_inspector.h"
#include "editor/slime_ai/slime_ai_scene_transaction.h"
#include "editor/slime_ai/slime_ai_service_client.h"
#include "scene/2d/node_2d.h"

namespace TestSlimeAIP05ProviderWire {

static String _fixture_service() {
	return OS::get_singleton()->get_executable_path().get_base_dir().get_base_dir().path_join("tools/slime_ai/agent_service/tests/native_wire_fixture_service.ts");
}

static void _exercise_profile(const String &p_profile) {
	INFO(p_profile);
	const String journal = OS::get_singleton()->get_user_data_dir().path_join(vformat("slime_ai_p05_wire_%s_%d.json", p_profile, OS::get_singleton()->get_ticks_usec()));
	Node2D *root = memnew(Node2D);
	root->set_name("FixtureRoot");
	{
		SlimeAI::ServiceClient service;
		REQUIRE(service.start(_fixture_service()));
		for (int i = 0; i < 500 && !service.is_ready(); i++) {
			Vector<Dictionary> frames;
			service.poll(frames);
			OS::get_singleton()->delay_usec(2000);
		}
		REQUIRE(service.is_ready());
		SlimeAI::SceneTransaction transaction(journal);
		SlimeAI::RunController run(service, transaction);
		Array route;
		if (p_profile == "openrouter_chat") {
			route.push_back("offline/upstream");
		}
		const Dictionary started = run.start(root, true, p_profile, "offline-fixture-model", "execute", "Preview one native marker", true, route);
		REQUIRE(String(started.get("status", "")) == "waiting_for_provider");
		Dictionary stale_data;
		stale_data["profile_fingerprint"] = "stale-profile";
		stale_data["call_id"] = "forged-call";
		stale_data["tool_name"] = "scene_patch_preview";
		stale_data["arguments"] = Dictionary();
		stale_data["provider_response_id"] = "forged-response";
		Dictionary stale_event;
		stale_event["protocol_version"] = "1.1";
		stale_event["request_id"] = started["service_request_id"];
		stale_event["run_id"] = started["run_id"];
		stale_event["event"] = "tool_call_ready";
		stale_event["data"] = stale_data;
		CHECK(String(Dictionary(run.on_frame(root, true, stale_event)["error"])["code"]) == "STALE_REFERENCE");
		CHECK(root->get_child_count() == 0);
		for (int i = 0; i < 1000 && run.get_preview_id().is_empty(); i++) {
			Vector<Dictionary> frames;
			service.poll(frames);
			for (const Dictionary &frame : frames) {
				run.on_frame(root, true, frame);
			}
			OS::get_singleton()->delay_usec(2000);
		}
		REQUIRE_FALSE(run.get_preview_id().is_empty());
		CHECK(root->get_child_count() == 0);
		CHECK(String(Dictionary(run.apply(root, true)["error"])["code"]) == "PERMISSION_REQUIRED");
		CHECK(String(run.grant()["status"]) == "granted");
		CHECK(String(run.apply(root, true)["status"]) == "applied");
		CHECK(root->get_child_count() == 1);
		CHECK(String(Dictionary(run.apply(root, true)["error"])["code"]) == "PERMISSION_DENIED");
		CHECK(root->get_child_count() == 1);
		CHECK(String(transaction.undo(root)["status"]) == "undone");
		CHECK(root->get_child_count() == 0);
		CHECK(String(transaction.redo(root)["status"]) == "redone");
		CHECK(root->get_child_count() == 1);
		for (int i = 0; i < 500 && String(run.status(root)["status"]) != "completed"; i++) {
			Vector<Dictionary> frames;
			service.poll(frames);
			for (const Dictionary &frame : frames) {
				run.on_frame(root, true, frame);
			}
			OS::get_singleton()->delay_usec(2000);
		}
		CHECK(String(run.status(root)["status"]) == "completed");
		CHECK(String(run.status(root)["profile_fingerprint"]).length() == 64);
		service.stop();
	}
	memdelete(root);
	DirAccess::remove_absolute(journal);
}

TEST_CASE("[SlimeAI][P05Wire] OpenAI Responses reaches native authority") { _exercise_profile("openai_responses"); }
TEST_CASE("[SlimeAI][P05Wire] Anthropic Messages reaches native authority") { _exercise_profile("anthropic_messages"); }
TEST_CASE("[SlimeAI][P05Wire] DeepSeek Chat reaches native authority") { _exercise_profile("deepseek_chat"); }
TEST_CASE("[SlimeAI][P05Wire] Kimi Chat reaches native authority") { _exercise_profile("kimi_chat"); }
TEST_CASE("[SlimeAI][P05Wire] OpenRouter Chat reaches native authority") { _exercise_profile("openrouter_chat"); }

TEST_CASE("[SlimeAI][P05Wire] live profiles reject missing consent and route changes before service dispatch") {
	const String journal = OS::get_singleton()->get_user_data_dir().path_join(vformat("slime_ai_p05_config_%d.json", OS::get_singleton()->get_ticks_usec()));
	Node2D *root = memnew(Node2D);
	root->set_name("FixtureRoot");
	{
		SlimeAI::ServiceClient service;
		REQUIRE(service.start(_fixture_service()));
		for (int i = 0; i < 500 && !service.is_ready(); i++) {
			Vector<Dictionary> frames;
			service.poll(frames);
			OS::get_singleton()->delay_usec(2000);
		}
		REQUIRE(service.is_ready());
		SlimeAI::SceneTransaction transaction(journal);
		SlimeAI::RunController run(service, transaction);
		for (const String &profile : { String("openai_responses"), String("anthropic_messages"), String("deepseek_chat"), String("kimi_chat"), String("openrouter_chat") }) {
			CHECK(String(Dictionary(run.start(root, true, profile, "offline-fixture-model", "execute", "Preview", false)["error"])["code"]) == "LIVE_AUTHORIZATION_REQUIRED");
		}
		CHECK(String(Dictionary(run.start(root, true, "openrouter_chat", "offline-fixture-model", "execute", "Preview", true)["error"])["code"]) == "UNSUPPORTED_CONFIGURATION");
		Array changed_route;
		changed_route.push_back("offline/upstream");
		CHECK(String(Dictionary(run.start(root, true, "deepseek_chat", "offline-fixture-model", "execute", "Preview", true, changed_route)["error"])["code"]) == "UNSUPPORTED_CONFIGURATION");
		CHECK(String(run.status(root)["status"]) == "idle");
		service.stop();
	}
	memdelete(root);
	DirAccess::remove_absolute(journal);
}

TEST_CASE("[SlimeAI][P05Wire] profile switch cannot bypass unresolved native operation") {
	const String journal = OS::get_singleton()->get_user_data_dir().path_join(vformat("slime_ai_p05_unresolved_%d.json", OS::get_singleton()->get_ticks_usec()));
	Node2D *root = memnew(Node2D);
	root->set_name("FixtureRoot");
	{
		SlimeAI::ServiceClient service;
		REQUIRE(service.start(_fixture_service()));
		for (int i = 0; i < 500 && !service.is_ready(); i++) {
			Vector<Dictionary> frames;
			service.poll(frames);
			OS::get_singleton()->delay_usec(2000);
		}
		REQUIRE(service.is_ready());
		SlimeAI::SceneTransaction transaction(journal);
		const Dictionary inspection = SlimeAI::SceneInspector::inspect(root, true);
		Dictionary position;
		position["type"] = "Vector2";
		Array coordinates;
		coordinates.push_back(48);
		coordinates.push_back(24);
		position["value"] = coordinates;
		Dictionary properties;
		properties["position"] = position;
		Dictionary operation;
		operation["op"] = "create_child";
		operation["parent_ref"] = inspection["root_ref"];
		operation["class_name"] = "Node2D";
		operation["name"] = "AI_Marker";
		operation["properties"] = properties;
		Array operations;
		operations.push_back(operation);
		Dictionary proposal;
		proposal["scene_ref"] = inspection["scene_ref"];
		proposal["base_revision"] = inspection["revision"];
		proposal["operations"] = operations;
		const Dictionary preview = transaction.preview(root, "unresolved-before-switch", proposal, true);
		REQUIRE(String(preview["status"]) == "preview");
		REQUIRE(String(transaction.grant(preview["preview_id"])["status"]) == "granted");
		transaction.set_inject_failure_after_effect(true);
		CHECK(String(Dictionary(transaction.apply(root, preview["preview_id"], true)["error"])["code"]) == "APPLY_FAILED_RECOVERY_REQUIRED");
		CHECK(root->get_child_count() == 1);
		SlimeAI::RunController run(service, transaction);
		CHECK(String(Dictionary(run.start(root, true, "deepseek_chat", "offline-fixture-model", "execute", "Try fresh request", true)["error"])["code"]) == "RECONCILIATION_REQUIRED");
		Array route;
		route.push_back("offline/upstream");
		CHECK(String(Dictionary(run.start(root, true, "openrouter_chat", "offline-fixture-model", "propose", "Try other route", true, route)["error"])["code"]) == "RECONCILIATION_REQUIRED");
		CHECK(root->get_child_count() == 1);
		service.stop();
	}
	memdelete(root);
	DirAccess::remove_absolute(journal);
}

} // namespace TestSlimeAIP05ProviderWire
