import importlib.resources
import os
import pathlib
import subprocess

from openhands.core.logger import openhands_logger as logger


def attempt_vscode_extension_install():
    """Checks if running in a supported editor and attempts to install the OpenHands companion extension.
    This is a best-effort, one-time attempt.
    """
    # 1. Check if we are in a supported editor environment
    is_vscode_like = os.environ.get('TERM_PROGRAM') == 'vscode'
    is_windsurf = (
        os.environ.get('__CFBundleIdentifier') == 'com.exafunction.windsurf'
        or 'windsurf' in os.environ.get('PATH', '').lower()
        or any(
            'windsurf' in val.lower()
            for val in os.environ.values()
            if isinstance(val, str)
        )
    )
    if not (is_vscode_like or is_windsurf):
        return

    # 2. Determine editor-specific commands and flags
    if is_windsurf:
        editor_command, editor_name, flag_suffix = 'surf', 'Windsurf', 'windsurf'
    else:
        editor_command, editor_name, flag_suffix = 'code', 'VS Code', 'vscode'

    # 3. Check if we've already successfully installed the extension.
    flag_dir = pathlib.Path.home() / '.openhands'
    flag_file = flag_dir / f'.{flag_suffix}_extension_installed'
    extension_id = 'openhands.openhands-vscode'

    try:
        flag_dir.mkdir(parents=True, exist_ok=True)
        if flag_file.exists():
            return  # Already successfully installed, exit.
    except OSError as e:
        logger.debug(
            f'Could not create or check {editor_name} extension flag directory: {e}'
        )
        return  # Don't proceed if we can't manage the flag.

    # 4. Check if the extension is already installed (even without our flag).
    if _is_extension_installed(editor_command, extension_id):
        print(f'INFO: OpenHands {editor_name} extension is already installed.')
        # Create flag to avoid future checks
        _mark_installation_successful(flag_file, editor_name)
        return

    # 5. Extension is not installed, attempt installation.
    print(
        f'INFO: First-time setup: attempting to install the OpenHands {editor_name} extension...'
    )

    # Attempt to install from bundled .vsix
    if _attempt_bundled_install(editor_command, editor_name):
        _mark_installation_successful(flag_file, editor_name)
        return  # Success! We are done.

    # If the bundled install failed, inform the user.
    print(
        'INFO: Automatic installation failed. Please check the OpenHands documentation for manual installation instructions.'
    )
    print(
        f'INFO: Will retry installation next time you run OpenHands in {editor_name}.'
    )


def _mark_installation_successful(flag_file: pathlib.Path, editor_name: str) -> None:
    """Mark the extension installation as successful by creating the flag file.

    Args:
        flag_file: Path to the flag file to create
        editor_name: Human-readable name of the editor for logging
    """
    try:
        flag_file.touch()
        logger.debug(f'{editor_name} extension installation marked as successful.')
    except OSError as e:
        logger.debug(f'Could not create {editor_name} extension success flag file: {e}')


def _is_extension_installed(editor_command: str, extension_id: str) -> bool:
    """Check if the OpenHands extension is already installed.

    Args:
        editor_command: The command to run the editor (e.g., 'code', 'windsurf')
        extension_id: The extension ID to check for

    Returns:
        bool: True if extension is already installed, False otherwise
    """
    try:
        process = subprocess.run(
            [editor_command, '--list-extensions'],
            capture_output=True,
            text=True,
            check=False,
        )
        if process.returncode == 0:
            installed_extensions = process.stdout.strip().split('\n')
            return extension_id in installed_extensions
    except Exception as e:
        logger.debug(f'Could not check installed extensions: {e}')

    return False


def _attempt_bundled_install(editor_command: str, editor_name: str) -> bool:
    """Attempt to install the extension from the bundled VSIX file.

    Uses the VSIX file packaged with the OpenHands installation.

    Args:
        editor_command: The command to run the editor (e.g., 'code', 'windsurf')
        editor_name: Human-readable name of the editor (e.g., 'VS Code', 'Windsurf')

    Returns:
        bool: True if installation succeeded, False otherwise
    """
    try:
        vsix_filename = 'openhands-vscode-0.0.1.vsix'
        with importlib.resources.as_file(
            importlib.resources.files('openhands').joinpath(
                'integrations', 'vscode', vsix_filename
            )
        ) as vsix_path:
            if vsix_path.exists():
                process = subprocess.run(
                    [
                        editor_command,
                        '--install-extension',
                        str(vsix_path),
                        '--force',
                    ],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if process.returncode == 0:
                    print(
                        f'INFO: Bundled {editor_name} extension installed successfully.'
                    )
                    return True
                else:
                    logger.debug(
                        f'Bundled .vsix installation failed: {process.stderr.strip()}'
                    )
            else:
                logger.debug(f'Bundled .vsix not found at {vsix_path}.')
    except Exception as e:
        logger.warning(
            f'Could not auto-install extension. Please make sure "code" command is in PATH. Error: {e}'
        )

    return False
