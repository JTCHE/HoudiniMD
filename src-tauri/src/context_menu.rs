//! The webview's own right-click menu holds a "Save as" that saves the app's
//! HTML shell, not the page in it. That item comes out here and the app's own
//! save goes in its place: the front end hears `save-page` and runs the same
//! flow as the button in the header and as Ctrl+S.
//!
//! WebView2 only. The other platforms have no such item to replace.

use tauri::WebviewWindow;

#[cfg(windows)]
pub fn hook(window: &WebviewWindow) {
    use tauri::Emitter;
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use webview2_com::{take_pwstr, ContextMenuRequestedEventHandler, CustomItemSelectedEventHandler};
    use windows::Win32::System::Com::IStream;
    use windows_core::{Interface, PWSTR};

    /// The built-in item, by the name WebView2 gives it.
    const SAVE_AS: &str = "saveAs";

    let asked = window.clone();
    let _ = window.with_webview(move |webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else {
            return;
        };
        let Ok(menus) = core.cast::<ICoreWebView2_11>() else {
            return;
        };
        let Ok(maker) = core
            .cast::<ICoreWebView2_2>()
            .and_then(|core| core.Environment())
            .and_then(|env| env.cast::<ICoreWebView2Environment9>())
        else {
            return;
        };
        let mut token = 0i64;
        let _ = menus.add_ContextMenuRequested(
            &ContextMenuRequestedEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else { return Ok(()) };
                let items = args.MenuItems()?;
                let mut count = 0u32;
                items.Count(&mut count)?;
                let named = |index: u32| -> Option<String> {
                    let item = items.GetValueAtIndex(index).ok()?;
                    let mut name = PWSTR::null();
                    item.Name(&mut name).ok()?;
                    Some(take_pwstr(name))
                };
                let Some(at) = (0..count).find(|index| named(*index).as_deref() == Some(SAVE_AS)) else {
                    return Ok(());
                };
                items.RemoveValueAtIndex(at)?;
                let ours = maker.CreateContextMenuItem(
                    windows_core::w!("Save as…"),
                    None::<&IStream>,
                    COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_COMMAND,
                )?;
                let window = asked.clone();
                let mut chosen = 0i64;
                ours.add_CustomItemSelected(
                    &CustomItemSelectedEventHandler::create(Box::new(move |_, _| {
                        let _ = window.emit("save-page", ());
                        Ok(())
                    })),
                    &mut chosen,
                )?;
                items.InsertValueAtIndex(at, &ours)?;
                Ok(())
            })),
            &mut token,
        );
    });
}

#[cfg(not(windows))]
pub fn hook(_window: &WebviewWindow) {}
