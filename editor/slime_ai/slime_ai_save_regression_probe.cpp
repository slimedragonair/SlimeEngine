#include "slime_ai_save_regression_probe.h"

#include "core/io/file_access.h"
#include "core/io/json.h"
#include "core/io/resource_loader.h"
#include "core/io/resource_saver.h"
#include "core/os/os.h"
#include "editor/editor_data.h"
#include "editor/editor_interface.h"
#include "editor/editor_node.h"
#include "editor/editor_undo_redo_manager.h"
#include "editor/slime_ai/slime_ai_scene_inspector.h"
#include "editor/slime_ai/slime_ai_scene_transaction.h"
#include "scene/2d/node_2d.h"
#include "scene/resources/style_box_flat.h"

namespace SlimeAI {

SaveRegressionProbe::SaveRegressionProbe() {
	if (OS::get_singleton()->get_environment("SLIME_AI_TEST_SAVE_REGRESSION") != "1") {
		return;
	}
	probe_dir = OS::get_singleton()->get_environment("SLIME_AI_SAVE_REGRESSION_DIR");
	expected_scene = OS::get_singleton()->get_environment("SLIME_AI_SAVE_REGRESSION_SCENE");
	scenario = OS::get_singleton()->get_environment("SLIME_AI_SAVE_REGRESSION_CASE");
	if (probe_dir.is_empty() || expected_scene != "res://main.tscn" ||
			(scenario != "normal" && scenario != "save_as" && scenario != "save_all" && scenario != "resource" && scenario != "undo_save")) {
		probe_dir.clear();
	}
}

void SaveRegressionProbe::write_result(const String &p_name, const Dictionary &p_data) const {
	Ref<FileAccess> file = FileAccess::open(probe_dir.path_join(p_name), FileAccess::WRITE);
	if (file.is_valid()) {
		file->store_string(JSON::stringify(p_data, "  "));
		file->flush();
	}
}

static Node2D *add_marker(Node *p_root, const String &p_name) {
	Node2D *root = Object::cast_to<Node2D>(p_root);
	if (!root) {
		return nullptr;
	}
	Node2D *child = memnew(Node2D);
	child->set_name(p_name);
	root->add_child(child);
	child->set_owner(root);
	return child;
}

void SaveRegressionProbe::run_single(SceneTransaction &p_transaction, Node *p_root) {
	stage = 9; // Saving may reenter editor notifications.
	Dictionary result;
	result["scenario"] = scenario;
	result["scene_before_sha256"] = FileAccess::get_sha256(expected_scene);
	result["service_required"] = false;
	if (scenario == "normal") {
		Node2D *marker = add_marker(p_root, "OrdinarySaveMarker");
		if (!marker) {
			result["error"] = "fixture_root_not_node2d";
		} else {
			EditorInterface::get_singleton()->mark_scene_as_unsaved();
			result["dirty_before"] = EditorNode::get_singleton()->is_scene_unsaved(EditorNode::get_editor_data().get_edited_scene());
			result["save_error"] = EditorInterface::get_singleton()->save_scene();
			result["dirty_after"] = EditorNode::get_singleton()->is_scene_unsaved(EditorNode::get_editor_data().get_edited_scene());
			result["marker_present"] = p_root->get_node_or_null(NodePath("OrdinarySaveMarker")) != nullptr;
		}
		result["scene_after_sha256"] = FileAccess::get_sha256(expected_scene);
	} else if (scenario == "save_as") {
		Node2D *marker = add_marker(p_root, "SaveAsMarker");
		if (!marker) {
			result["error"] = "fixture_root_not_node2d";
		} else {
			EditorInterface::get_singleton()->mark_scene_as_unsaved();
			result["dirty_before"] = EditorNode::get_singleton()->is_scene_unsaved(EditorNode::get_editor_data().get_edited_scene());
			result["save_error"] = EditorNode::get_singleton()->save_scene_to_path("res://saved_as.tscn", false);
			result["dirty_after"] = EditorNode::get_singleton()->is_scene_unsaved(EditorNode::get_editor_data().get_edited_scene());
			result["scene_path_after"] = p_root->get_scene_file_path();
			result["saved_as_exists"] = FileAccess::exists("res://saved_as.tscn");
			result["saved_as_sha256"] = FileAccess::get_sha256("res://saved_as.tscn");
		}
		result["scene_after_sha256"] = FileAccess::get_sha256(expected_scene);
		result["dialog_cancel"] = "not_run_no_test_owned_dialog_cancel_callback";
	} else if (scenario == "resource") {
		const String path = "res://ordinary.tres";
		result["resource_before_sha256"] = FileAccess::get_sha256(path);
		Ref<StyleBoxFlat> resource = ResourceLoader::load(path, "", ResourceFormatLoader::CACHE_MODE_IGNORE);
		if (resource.is_null()) {
			result["error"] = "fixture_resource_load_failed";
		} else {
			const Color changed(0.8, 0.2, 0.1, 1.0);
			resource->set_bg_color(changed);
			result["save_error"] = ResourceSaver::save(resource, path);
			Ref<StyleBoxFlat> reloaded = ResourceLoader::load(path, "", ResourceFormatLoader::CACHE_MODE_IGNORE);
			result["reload_matches"] = reloaded.is_valid() && reloaded->get_bg_color() == changed;
			result["resource_after_sha256"] = FileAccess::get_sha256(path);
		}
	} else if (scenario == "undo_save") {
		const Dictionary inspection = SceneInspector::inspect(p_root, false);
		if (inspection.has("error")) {
			result["error"] = "inspection_failed";
		} else {
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
			operation["name"] = "UndoSaveMarker";
			operation["properties"] = properties;
			Array operations;
			operations.push_back(operation);
			Dictionary proposal;
			proposal["scene_ref"] = inspection["scene_ref"];
			proposal["base_revision"] = inspection["revision"];
			proposal["operations"] = operations;
			const Dictionary preview = p_transaction.preview(p_root, "ordinary-undo-save-probe", proposal, false);
			const String preview_id = preview.get("preview_id", "");
			result["preview"] = preview;
			if (!preview_id.is_empty()) {
				result["grant"] = p_transaction.grant(preview_id);
				result["apply"] = p_transaction.apply(p_root, preview_id, false);
				result["undo"] = p_transaction.undo(p_root);
				result["absent_after_undo"] = p_root->get_node_or_null(NodePath("UndoSaveMarker")) == nullptr;
				result["save_after_undo_error"] = EditorInterface::get_singleton()->save_scene();
				result["dirty_after_undo_save"] = EditorNode::get_singleton()->is_scene_unsaved(EditorNode::get_editor_data().get_edited_scene());
				result["redo"] = p_transaction.redo(p_root);
				result["present_after_redo"] = p_root->get_node_or_null(NodePath("UndoSaveMarker")) != nullptr;
				result["save_after_redo_error"] = EditorInterface::get_singleton()->save_scene();
				result["dirty_after_redo_save"] = EditorNode::get_singleton()->is_scene_unsaved(EditorNode::get_editor_data().get_edited_scene());
				result["operation_status"] = p_transaction.status(p_root, "ordinary-undo-save-probe");
			}
		}
		result["scene_after_sha256"] = FileAccess::get_sha256(expected_scene);
	}
	write_result("result.json", result);
}

void SaveRegressionProbe::prepare_save_all(Node *) {
	stage = 9;
	Dictionary ready;
	ready["scenario"] = "save_all";
	ready["scene_before_sha256"] = FileAccess::get_sha256(expected_scene);
	ready["second_before_sha256"] = FileAccess::get_sha256("res://second.tscn");
	ready["load_second_error"] = EditorNode::get_singleton()->load_scene("res://second.tscn");
	EditorData &data = EditorNode::get_editor_data();
	for (int i = 0; i < data.get_edited_scene_count(); i++) {
		Node *root = data.get_edited_scene_root(i);
		if (!root) {
			continue;
		}
		const String path = root->get_scene_file_path();
		if (path != expected_scene && path != "res://second.tscn") {
			continue;
		}
		const String marker_name = path == expected_scene ? "SaveAllLockedMarker" : "SaveAllOtherMarker";
		add_marker(root, marker_name);
		EditorUndoRedoManager::get_singleton()->set_history_as_unsaved(data.get_scene_history_id(i));
		ready[path == expected_scene ? "main_dirty_before" : "second_dirty_before"] = EditorNode::get_singleton()->is_scene_unsaved(i);
	}
	write_result("ready.json", ready);
	stage = 1;
}

void SaveRegressionProbe::finish_save_all() {
	stage = 9;
	EditorInterface::get_singleton()->save_all_scenes();
	Dictionary result;
	result["scenario"] = "save_all";
	result["save_all_return"] = "void_check_per_tab_and_disk";
	EditorData &data = EditorNode::get_editor_data();
	for (int i = 0; i < data.get_edited_scene_count(); i++) {
		Node *root = data.get_edited_scene_root(i);
		if (!root) {
			continue;
		}
		const String path = root->get_scene_file_path();
		if (path == expected_scene) {
			result["main_dirty_after"] = EditorNode::get_singleton()->is_scene_unsaved(i);
			result["main_marker_present"] = root->get_node_or_null(NodePath("SaveAllLockedMarker")) != nullptr;
		} else if (path == "res://second.tscn") {
			result["second_dirty_after"] = EditorNode::get_singleton()->is_scene_unsaved(i);
			result["second_marker_present"] = root->get_node_or_null(NodePath("SaveAllOtherMarker")) != nullptr;
		}
	}
	result["second_after_sha256"] = FileAccess::get_sha256("res://second.tscn");
	result["main_after_sha256"] = "parent_checks_after_unlock";
	write_result("result.json", result);
}

void SaveRegressionProbe::tick(SceneTransaction &p_transaction, Node *p_root, bool) {
	if (!enabled() || stage == 9 || !p_root || p_root->get_scene_file_path() != expected_scene) {
		return;
	}
	if (scenario == "save_all") {
		if (stage == 0) {
			prepare_save_all(p_root);
		} else if (stage == 1 && FileAccess::exists(probe_dir.path_join("go.flag"))) {
			finish_save_all();
		}
	} else if (stage == 0) {
		run_single(p_transaction, p_root);
	}
}

} // namespace SlimeAI
