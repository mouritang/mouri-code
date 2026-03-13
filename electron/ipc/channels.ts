export enum IPC {
  // Agent/PTY
  SpawnAgent = 'spawn_agent',
  WriteToAgent = 'write_to_agent',
  ResizeAgent = 'resize_agent',
  PauseAgent = 'pause_agent',
  ResumeAgent = 'resume_agent',
  KillAgent = 'kill_agent',
  CountRunningAgents = 'count_running_agents',
  KillAllAgents = 'kill_all_agents',
  ListAgents = 'list_agents',
  UpdateGlobalMonitorConfig = 'update_global_monitor_config',
  GetGlobalMonitorStatus = 'get_global_monitor_status',
  RunGlobalMonitorNow = 'run_global_monitor_now',
  VisionDescribeImages = 'vision_describe_images',
  SaveClipboardImage = 'save_clipboard_image',

  // Task
  CreateTask = 'create_task',
  DeleteTask = 'delete_task',

  // Git
  GetChangedFiles = 'get_changed_files',
  GetFileDiff = 'get_file_diff',
  ReadFileAsDataUrl = 'read_file_as_data_url',
  GetGitignoredDirs = 'get_gitignored_dirs',
  GetWorktreeStatus = 'get_worktree_status',
  CheckMergeStatus = 'check_merge_status',
  MergeTask = 'merge_task',
  GetBranchLog = 'get_branch_log',
  PushTask = 'push_task',
  ListBranches = 'list_branches',
  CheckoutBranch = 'checkout_branch',
  CreateBranch = 'create_branch',
  CommitChanges = 'commit_changes',
  RebaseTask = 'rebase_task',
  GetMainBranch = 'get_main_branch',
  GetCurrentBranch = 'get_current_branch',

  // Persistence
  SaveAppState = 'save_app_state',
  LoadAppState = 'load_app_state',

  // Window
  WindowIsFocused = '__window_is_focused',
  WindowIsMaximized = '__window_is_maximized',
  WindowMinimize = '__window_minimize',
  WindowToggleMaximize = '__window_toggle_maximize',
  WindowClose = '__window_close',
  WindowForceClose = '__window_force_close',
  WindowHide = '__window_hide',
  WindowMaximize = '__window_maximize',
  WindowUnmaximize = '__window_unmaximize',
  WindowSetSize = '__window_set_size',
  WindowSetPosition = '__window_set_position',
  WindowGetPosition = '__window_get_position',
  WindowGetSize = '__window_get_size',
  WindowFocus = '__window_focus',
  WindowBlur = '__window_blur',
  WindowResized = '__window_resized',
  WindowMoved = '__window_moved',
  WindowCloseRequested = '__window_close_requested',

  // Dialog
  DialogConfirm = '__dialog_confirm',
  DialogOpen = '__dialog_open',

  // Shell
  ShellReveal = '__shell_reveal',

  // Remote access
  StartRemoteServer = 'start_remote_server',
  StopRemoteServer = 'stop_remote_server',
  GetRemoteStatus = 'get_remote_status',
}
