; ============================================================
; FAhubX Installer - Inno Setup Script
; ============================================================
; Build with: iscc.exe fahubx-setup.iss
; Requires: Inno Setup 6.x (https://jrsoftware.org/isinfo.php)
; ============================================================

#define MyAppName "FAhubX"
#define MyAppVersion "1.4.2"
#define MyAppPublisher "FAhubX"
#define MyAppURL "https://fahubx.starbright-solutions.com"
#define MyAppExeName "FAhubX.bat"

[Setup]
AppId={{B3F7A2D1-9E4C-4A6B-8D5F-1C2E3F4A5B6C}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
DefaultDirName=C:\{#MyAppName}
DefaultGroupName={#MyAppName}
OutputDir=output
OutputBaseFilename=FAhubX-Setup-v{#MyAppVersion}
SetupIconFile=assets\fahubx.ico
Compression=lzma2/ultra64
SolidCompression=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
WizardStyle=modern
DisableProgramGroupPage=yes
LicenseFile=
UninstallDisplayIcon={app}\assets\fahubx.ico

[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Node.js runtime
Source: "staging\node\*"; DestDir: "{app}\node"; Flags: ignoreversion recursesubdirs createallsubdirs

; PostgreSQL portable
Source: "staging\pgsql\*"; DestDir: "{app}\pgsql"; Flags: ignoreversion recursesubdirs createallsubdirs

; Redis for Windows
Source: "staging\redis\*"; DestDir: "{app}\redis"; Flags: ignoreversion recursesubdirs createallsubdirs

; Backend (compiled + obfuscated)
Source: "staging\backend\*"; DestDir: "{app}\backend"; Flags: ignoreversion recursesubdirs createallsubdirs

; Frontend (built static files)
Source: "staging\frontend\*"; DestDir: "{app}\frontend"; Flags: ignoreversion recursesubdirs createallsubdirs

; Service scripts (go to app root)
Source: "scripts\start.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "scripts\stop.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "scripts\fahubx.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "scripts\redis.conf"; DestDir: "{app}\redis"; Flags: ignoreversion

; Helper scripts (go to scripts subfolder)
Source: "scripts\init-db.bat"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\generate-env.js"; DestDir: "{app}\scripts"; Flags: ignoreversion

; Brand assets (icon)
Source: "assets\fahubx.ico"; DestDir: "{app}\assets"; Flags: ignoreversion

[Dirs]
Name: "{app}\data"; Permissions: users-full
Name: "{app}\logs"; Permissions: users-full

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\assets\fahubx.ico"; Comment: "Start FAhubX"
Name: "{group}\Stop {#MyAppName}"; Filename: "{app}\stop.bat"; WorkingDir: "{app}"; IconFilename: "{app}\assets\fahubx.ico"; Comment: "Stop FAhubX services"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\assets\fahubx.ico"; Tasks: desktopicon; Comment: "Start FAhubX"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch FAhubX"; Flags: nowait postinstall skipifsilent shellexec

[UninstallRun]
Filename: "{app}\stop.bat"; Parameters: ""; Flags: runhidden waituntilterminated; RunOnceId: "StopServices"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\logs"
Type: filesandordirs; Name: "{app}\data"
Type: filesandordirs; Name: "{app}\pgsql\data"
Type: files; Name: "{app}\backend\.env"

[Code]
var
  DeployModePage: TInputOptionWizardPage;
  PortConfigPage: TWizardPage;
  AppPortEdit: TNewEdit;
  PgPortEdit: TNewEdit;
  RedisPortEdit: TNewEdit;

procedure InitializeWizard();
var
  AppPortLabel, PgPortLabel, RedisPortLabel, PortInfoLabel: TNewStaticText;
begin
  // === Page 1: Deploy Mode ===
  DeployModePage := CreateInputOptionPage(wpSelectDir,
    'Deployment Mode', 'Choose how FAhubX will be deployed',
    'Select the deployment mode for this installation:',
    True, False);
  DeployModePage.Add('Local Mode - Run on this computer with License Key (Recommended)');
  DeployModePage.Add('Cloud Mode - Deploy on VPS server');
  DeployModePage.SelectedValueIndex := 0;

  // === Page 2: Port Configuration ===
  PortConfigPage := CreateCustomPage(DeployModePage.ID,
    'Port Configuration', 'Configure service ports');

  PortInfoLabel := TNewStaticText.Create(PortConfigPage);
  PortInfoLabel.Parent := PortConfigPage.Surface;
  PortInfoLabel.Caption := 'Configure the ports FAhubX will use.'#13#10 +
    'Change if another program is already using a port.';
  PortInfoLabel.Top := 5;
  PortInfoLabel.Left := 0;
  PortInfoLabel.AutoSize := True;

  AppPortLabel := TNewStaticText.Create(PortConfigPage);
  AppPortLabel.Parent := PortConfigPage.Surface;
  AppPortLabel.Caption := 'FAhubX Web Port (default: 9600):';
  AppPortLabel.Top := 45;
  AppPortLabel.Left := 0;

  AppPortEdit := TNewEdit.Create(PortConfigPage);
  AppPortEdit.Parent := PortConfigPage.Surface;
  AppPortEdit.Top := 65;
  AppPortEdit.Left := 0;
  AppPortEdit.Width := 120;
  AppPortEdit.Text := '9600';

  PgPortLabel := TNewStaticText.Create(PortConfigPage);
  PgPortLabel.Parent := PortConfigPage.Surface;
  PgPortLabel.Caption := 'PostgreSQL Port (default: 5433):';
  PgPortLabel.Top := 100;
  PgPortLabel.Left := 0;

  PgPortEdit := TNewEdit.Create(PortConfigPage);
  PgPortEdit.Parent := PortConfigPage.Surface;
  PgPortEdit.Top := 120;
  PgPortEdit.Left := 0;
  PgPortEdit.Width := 120;
  PgPortEdit.Text := '5433';

  RedisPortLabel := TNewStaticText.Create(PortConfigPage);
  RedisPortLabel.Parent := PortConfigPage.Surface;
  RedisPortLabel.Caption := 'Redis Port (default: 6380):';
  RedisPortLabel.Top := 155;
  RedisPortLabel.Left := 0;

  RedisPortEdit := TNewEdit.Create(PortConfigPage);
  RedisPortEdit.Parent := PortConfigPage.Surface;
  RedisPortEdit.Top := 175;
  RedisPortEdit.Left := 0;
  RedisPortEdit.Width := 120;
  RedisPortEdit.Text := '6380';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;

  // Validate port configuration page
  if CurPageID = PortConfigPage.ID then
  begin
    if (StrToIntDef(AppPortEdit.Text, 0) < 1024) or (StrToIntDef(AppPortEdit.Text, 0) > 65535) then
    begin
      MsgBox('FAhubX web port must be between 1024 and 65535.', mbError, MB_OK);
      Result := False;
      Exit;
    end;

    if (StrToIntDef(PgPortEdit.Text, 0) < 1024) or (StrToIntDef(PgPortEdit.Text, 0) > 65535) then
    begin
      MsgBox('PostgreSQL port must be between 1024 and 65535.', mbError, MB_OK);
      Result := False;
      Exit;
    end;

    if (StrToIntDef(RedisPortEdit.Text, 0) < 1024) or (StrToIntDef(RedisPortEdit.Text, 0) > 65535) then
    begin
      MsgBox('Redis port must be between 1024 and 65535.', mbError, MB_OK);
      Result := False;
      Exit;
    end;

    if (AppPortEdit.Text = PgPortEdit.Text) or (AppPortEdit.Text = RedisPortEdit.Text) or (PgPortEdit.Text = RedisPortEdit.Text) then
    begin
      MsgBox('All three ports must be different.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;
end;

function GetDeployMode(): String;
begin
  if DeployModePage.SelectedValueIndex = 0 then
    Result := 'local'
  else
    Result := 'cloud';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  NodeExe, GenEnvScript, InitDbScript: String;
  GenEnvParams: String;
begin
  if CurStep = ssPostInstall then
  begin
    NodeExe := ExpandConstant('{app}\node\node.exe');
    GenEnvScript := ExpandConstant('{app}\scripts\generate-env.js');
    InitDbScript := ExpandConstant('{app}\scripts\init-db.bat');

    // Step 1: Generate .env file
    WizardForm.StatusLabel.Caption := 'Generating configuration...';
    GenEnvParams := '"' + GenEnvScript + '"' +
      ' --mode ' + GetDeployMode() +
      ' --app-port ' + AppPortEdit.Text +
      ' --pg-port ' + PgPortEdit.Text +
      ' --redis-port ' + RedisPortEdit.Text +
      ' --install-dir "' + ExpandConstant('{app}') + '"';

    Exec(NodeExe, GenEnvParams, ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode);

    if ResultCode <> 0 then
    begin
      MsgBox('FATAL: Failed to generate configuration file (code ' + IntToStr(ResultCode) + ').' + #13#10 +
        'Installation will abort. Check logs directory for details.', mbCriticalError, MB_OK);
      Abort();
    end;

    // Step 2: Initialize database
    WizardForm.StatusLabel.Caption := 'Initializing database (this may take a minute)...';
    Exec(InitDbScript, '', ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode);

    if ResultCode <> 0 then
    begin
      MsgBox('FATAL: Database initialization failed (code ' + IntToStr(ResultCode) + ').' + #13#10 +
        'Check logs\pgsql-init.log and logs\pgsql-initdb.log for details.' + #13#10 +
        'Installation will abort.', mbCriticalError, MB_OK);
      Abort();
    end;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
  StopScript: String;
begin
  if CurUninstallStep = usUninstall then
  begin
    StopScript := ExpandConstant('{app}\stop.bat');
    if FileExists(StopScript) then
    begin
      Exec(StopScript, '', ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end;
  end;
end;
