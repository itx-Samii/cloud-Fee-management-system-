[Setup]
AppName=Fee Management System
AppVersion=1.0
DefaultDirName={autopf}\FeeManagement
DefaultGroupName=Fee Management System
UninstallDisplayIcon={app}\app_icon.ico
Compression=lzma2
SolidCompression=yes
OutputDir=userdocs:Inno Setup Examples Output
OutputBaseFilename=Fee_Management_Setup
SetupIconFile=app_icon.ico

[Files]
; Build output, libraries and the settings file (database password) are created on the client's PC.
Source: "*"; DestDir: "{app}"; Excludes: "node_modules,.next,.env.local,*.iss"; Flags: recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Fee Management System"; Filename: "{app}\Launcher.vbs"; IconFilename: "{app}\app_icon.ico"
Name: "{commondesktop}\Fee Management System"; Filename: "{app}\Launcher.vbs"; IconFilename: "{app}\app_icon.ico"

[Run]
Filename: "{app}\INSTALL_ERP.bat"; Description: "Installing System Dependencies..."; Flags: runascurrentuser waituntilterminated
Filename: "{app}\Launcher.vbs"; Description: "Launch Fee Management System Now"; Flags: postinstall nowait
