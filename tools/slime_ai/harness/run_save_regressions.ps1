param([string]$EvidenceDir = 'docs/slime_ai/evidence')

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$fixture = (Resolve-Path (Join-Path $repo 'tools/slime_ai/fixtures/2d')).Path
$binary = Join-Path $repo 'bin/godot.windows.editor.dev.x86_64.console.exe'
$evidenceRoot = Join-Path $repo $EvidenceDir
$runName = 'p05-save-regressions-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$evidence = Join-Path $evidenceRoot $runName
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$sourceRevision = (& git -C $repo rev-parse HEAD).Trim()
$binaryHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $binary).Hash
$manifest = Join-Path $evidence 'manifest.txt'
$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("source_revision=$sourceRevision")
$lines.Add("binary_sha256=$binaryHash")
$lines.Add("binary=$binary")
$lines.Add("evidence=$evidence")
foreach ($source in @('editor/slime_ai/slime_ai_save_regression_probe.h', 'editor/slime_ai/slime_ai_save_regression_probe.cpp', 'tools/slime_ai/harness/run_save_regressions.ps1', 'editor/editor_node.cpp', 'editor/editor_interface.cpp', 'drivers/windows/file_access_windows.cpp', 'scene/resources/resource_format_text.cpp')) {
    $lines.Add("source_sha256:$source=$((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $repo $source)).Hash)")
}
$lines.Add('scope=disposable copied 2D fixture; opt-in native editor probe; no service connection')
$lines.Add('SV02_dialog_cancellation=not_run_no_test_owned_dialog_cancel_callback')
$lines.Add('full_upstream_suite=not_run')
$lines | Set-Content -LiteralPath $manifest

$names = @('SLIME_AI_TEST_SAVE_REGRESSION', 'SLIME_AI_SAVE_REGRESSION_DIR', 'SLIME_AI_SAVE_REGRESSION_SCENE', 'SLIME_AI_SAVE_REGRESSION_CASE')
$prior = @{}
foreach ($name in $names) { $prior[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$editorProcess = $null
$lock = $null

function Wait-ProbeFile([string]$path, [int]$seconds) {
    $limit = [DateTime]::UtcNow.AddSeconds($seconds)
    while (!(Test-Path -LiteralPath $path)) {
        if ($script:editorProcess -and $script:editorProcess.HasExited) { throw "Editor exited before $path (exit=$($script:editorProcess.ExitCode))." }
        if ([DateTime]::UtcNow -gt $limit) { throw "Timed out waiting for $path." }
        Start-Sleep -Milliseconds 200
    }
}

try {
    foreach ($caseName in @('normal', 'save_as', 'save_all', 'resource', 'undo_save')) {
        $copy = Join-Path ([IO.Path]::GetTempPath()) ('slime-ai-save-regression-' + $caseName + '-' + [Guid]::NewGuid().ToString('N'))
        $caseEvidence = Join-Path $evidence $caseName
        $probe = Join-Path $copy 'probe'
        New-Item -ItemType Directory -Path $copy, $caseEvidence, $probe -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $fixture 'project.godot'), (Join-Path $fixture 'main.tscn') -Destination $copy
        $main = Join-Path $copy 'main.tscn'
        $second = Join-Path $copy 'second.tscn'
        $resource = Join-Path $copy 'ordinary.tres'
        [IO.File]::WriteAllText($second, "[gd_scene load_steps=1 format=3]`n`n[node name=`"SecondRoot`" type=`"Node2D`"]`n")
        [IO.File]::WriteAllText($resource, "[gd_resource type=`"StyleBoxFlat`" format=3]`n`n[resource]`nbg_color = Color(0.2, 0.3, 0.4, 1)`n")
        $mainBefore = (Get-FileHash -Algorithm SHA256 -LiteralPath $main).Hash
        $secondBefore = (Get-FileHash -Algorithm SHA256 -LiteralPath $second).Hash
        $resourceBefore = (Get-FileHash -Algorithm SHA256 -LiteralPath $resource).Hash
        $lines.Add("${caseName}_fixture_copy=$copy")
        $lines | Set-Content -LiteralPath $manifest

        [Environment]::SetEnvironmentVariable('SLIME_AI_TEST_SAVE_REGRESSION', '1', 'Process')
        [Environment]::SetEnvironmentVariable('SLIME_AI_SAVE_REGRESSION_DIR', $probe, 'Process')
        [Environment]::SetEnvironmentVariable('SLIME_AI_SAVE_REGRESSION_SCENE', 'res://main.tscn', 'Process')
        [Environment]::SetEnvironmentVariable('SLIME_AI_SAVE_REGRESSION_CASE', $caseName, 'Process')
        $stdout = Join-Path $caseEvidence 'editor-stdout.txt'
        $stderr = Join-Path $caseEvidence 'editor-stderr.txt'
        $editorProcess = Start-Process -FilePath $binary -ArgumentList @('--headless', '--editor', '--path', $copy, 'res://main.tscn') -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
        foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $prior[$name], 'Process') }

        if ($caseName -eq 'save_all') {
            $readyPath = Join-Path $probe 'ready.json'
            Wait-ProbeFile $readyPath 90
            Copy-Item -LiteralPath $readyPath -Destination (Join-Path $caseEvidence 'ready.json')
            $ready = Get-Content -Raw -LiteralPath $readyPath | ConvertFrom-Json
            if ($ready.load_second_error -ne 0 -or !$ready.main_dirty_before -or !$ready.second_dirty_before) { throw 'Save All preparation did not produce two dirty scene tabs.' }
            $lock = [IO.File]::Open($main, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)
            [IO.File]::WriteAllText((Join-Path $probe 'go.flag'), 'go')
        }
        $resultPath = Join-Path $probe 'result.json'
        Wait-ProbeFile $resultPath 90
        Copy-Item -LiteralPath $resultPath -Destination (Join-Path $caseEvidence 'result.json')
        $result = Get-Content -Raw -LiteralPath $resultPath | ConvertFrom-Json
        if ($lock) { $lock.Dispose(); $lock = $null }

        $mainAfter = (Get-FileHash -Algorithm SHA256 -LiteralPath $main).Hash
        $secondAfter = (Get-FileHash -Algorithm SHA256 -LiteralPath $second).Hash
        $resourceAfter = (Get-FileHash -Algorithm SHA256 -LiteralPath $resource).Hash
        $mainText = Get-Content -Raw -LiteralPath $main
        switch ($caseName) {
            'normal' {
                if ($result.save_error -ne 0 -or !$result.dirty_before -or $result.dirty_after -or !$result.marker_present -or $mainAfter -eq $mainBefore -or
                    ([regex]::Matches($mainText, '\[node name="OrdinarySaveMarker"')).Count -ne 1) { throw 'SV01 ordinary save failed.' }
            }
            'save_as' {
                $savedAs = Join-Path $copy 'saved_as.tscn'
                if ($result.save_error -ne 0 -or !$result.dirty_before -or $result.dirty_after -or !$result.saved_as_exists -or
                    $result.scene_path_after -ne 'res://saved_as.tscn' -or $mainAfter -ne $mainBefore -or !(Test-Path -LiteralPath $savedAs) -or
                    ([regex]::Matches((Get-Content -Raw -LiteralPath $savedAs), '\[node name="SaveAsMarker"')).Count -ne 1) { throw 'SV02 Save As success path failed.' }
            }
            'save_all' {
                if (!$result.main_dirty_after -or $result.second_dirty_after -or !$result.main_marker_present -or !$result.second_marker_present -or
                    $mainAfter -ne $mainBefore -or $secondAfter -eq $secondBefore -or
                    ([regex]::Matches((Get-Content -Raw -LiteralPath $second), '\[node name="SaveAllOtherMarker"')).Count -ne 1) { throw 'SV03 Save All partial failure did not preserve per-tab state.' }
            }
            'resource' {
                if ($result.save_error -ne 0 -or !$result.reload_matches -or $resourceAfter -eq $resourceBefore) { throw 'SV07 text resource save/reload failed.' }
            }
            'undo_save' {
                if ($result.save_after_undo_error -ne 0 -or $result.save_after_redo_error -ne 0 -or !$result.absent_after_undo -or
                    !$result.present_after_redo -or $result.dirty_after_undo_save -or $result.dirty_after_redo_save -or
                    ([regex]::Matches($mainText, '\[node name="UndoSaveMarker"')).Count -ne 1) { throw 'SV08 apply/undo/save/redo/save consistency failed.' }
            }
        }

        $editorPid = $editorProcess.Id
        if (!$editorProcess.HasExited) { Stop-Process -Id $editorPid -Force }
        $editorProcess = $null
        $reopenScene = if ($caseName -eq 'save_as') { 'res://saved_as.tscn' } else { 'res://main.tscn' }
        $reopen = Start-Process -FilePath $binary -ArgumentList @('--headless', '--editor', '--path', $copy, $reopenScene, '--quit-after', '2') -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput (Join-Path $caseEvidence 'reopen-stdout.txt') -RedirectStandardError (Join-Path $caseEvidence 'reopen-stderr.txt') -Wait -PassThru
        if ($reopen.ExitCode -ne 0) { throw "$caseName editor reopen failed (exit=$($reopen.ExitCode))." }
        $caseManifest = @(
            "scenario=$caseName", "fixture_copy=$copy", "editor_pid=$editorPid", "reopen_exit_code=$($reopen.ExitCode)",
            "main_before_sha256=$mainBefore", "main_after_sha256=$mainAfter", "second_before_sha256=$secondBefore", "second_after_sha256=$secondAfter",
            "resource_before_sha256=$resourceBefore", "resource_after_sha256=$resourceAfter", 'result=passed'
        )
        $caseManifest | Set-Content -LiteralPath (Join-Path $caseEvidence 'manifest.txt')
        $lines.Add("${caseName}=passed")
        $lines | Set-Content -LiteralPath $manifest
    }
    $lines.Add('result=passed')
    $lines | Set-Content -LiteralPath $manifest
    Write-Output "evidence=$evidence"
    Write-Output 'SV01=passed SV02_save_as=passed SV02_cancel=not_run SV03=passed SV07=passed SV08=passed'
}
catch {
    $lines.Add("result=failed")
    $lines.Add("failure=$($_.Exception.Message)")
    $lines | Set-Content -LiteralPath $manifest
    throw
}
finally {
    if ($lock) { $lock.Dispose() }
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $prior[$name], 'Process') }
    if ($editorProcess -and !$editorProcess.HasExited) { Stop-Process -Id $editorProcess.Id -Force }
}
