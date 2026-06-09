
import { supabase } from '../../../config/supabase-client.js';
import { store } from '../../../config/app-store.js';

let isInitialized = false;
let currentAdminId = null;
let currentUserId = null;

export async function initSettings() {
    if (isInitialized) return;
    console.log('[Settings] Module Initialized');

    // Setup visual listeners immediately (previews)
    setupImagePreviews();

    await loadSettings();
    setupEventListeners();

    isInitialized = true;
}

async function loadSettings() {
    try {
        const sedeId = store.get().adminContext?.sedeId || window.adminContext?.sedeId;
        if (!sedeId) console.warn('[Settings] No Sede ID found in context.');

        // 1. Load Configurations (Sede Info & Toggles)
        if (sedeId) {
            const { data: configs, error: confError } = await supabase
                .from('configuraciones')
                .select('*')
                .eq('sede_id', sedeId);

            if (!confError && configs) {
                const configMap = {};
                configs.forEach(item => { configMap[item.clave] = item.valor; });

                // Toggles
                setToggle('toggle_inscripciones', configMap['inscripciones_abiertas']);
                setToggle('toggle_notas', configMap['carga_notas_abierta']);
                setToggle('toggle_horarios', configMap['edicion_horarios_abierta']);

                // Sede Info
                setInput('conf_nombre_sede', configMap['nombre_sede']);
                setInput('conf_direccion_sede', configMap['direccion_sede']);
                setInput('conf_periodo', configMap['periodo_actual']);
                setInput('conf_pais_sede', configMap['pais_sede']);
                setInput('conf_registro_legal', configMap['registro_legal_sede']);

                // Sede Logo
                if (configMap['logo_url_sede']) {
                    const img = document.getElementById('preview_sede_logo');
                    const icon = document.getElementById('icon_sede_logo');
                    if (img && icon) {
                        img.src = configMap['logo_url_sede'];
                        img.classList.remove('hidden');
                        icon.classList.add('hidden');
                    }
                }
            }
        }

        // 2. Load Admin Profile
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            document.getElementById('profile_email').value = user.email;

            // 2.1 Get 'usuarios' record to find the Integer ID using auth_id (UUID)
            const { data: userProfile, error: uError } = await supabase
                .from('usuarios')
                .select('id, url_foto')
                .eq('auth_id', user.id)
                .single();

            if (uError || !userProfile) {
                console.warn('[Settings] User profile not found for auth_id:', user.id);
                return;
            }

            currentUserId = userProfile.id; // This is the Integer ID

            // 2.2 Load Avatar
            if (userProfile.url_foto) {
                const img = document.getElementById('preview_admin_avatar');
                const icon = document.getElementById('icon_admin_avatar');
                if (img && icon) {
                    img.src = userProfile.url_foto;
                    img.classList.remove('hidden');
                    icon.classList.add('hidden');
                }
            }

            // 2.3 Fetch Personal Administrativo details using Integer ID
            // Logic: The admin's `usuario_id` in `personal_administrativo` refers to `usuarios.id` (Integer)
            // We use currentUserId (Integer) to find the linked Admin profile
            const { data: adminData } = await supabase
                .from('personal_administrativo')
                .select('id, nombres, apellidos')
                .eq('usuario_id', currentUserId)
                .single();

            if (adminData) {
                currentAdminId = adminData.id;
                setInput('profile_nombres', adminData.nombres);
                setInput('profile_apellidos', adminData.apellidos);
            }
        }

    } catch (e) {
        console.error('[Settings] Load Error:', e);
    }
}

function setupEventListeners() {
    // Toggles (Auto Save)
    setupToggleListener('toggle_inscripciones', 'inscripciones_abiertas');
    setupToggleListener('toggle_notas', 'carga_notas_abierta');
    setupToggleListener('toggle_horarios', 'edicion_horarios_abierta');

    // Form: Datos Sede
    const formInst = document.getElementById('form_institution');
    if (formInst) {
        formInst.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveSedeData(formInst);
        });
    }

    // Form: Perfil Admin
    const formProfile = document.getElementById('form_profile');
    if (formProfile) {
        formProfile.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveProfileData(formProfile);
        });
    }
}

function setupImagePreviews() {
    setupPreview('input_sede_logo', 'preview_sede_logo', 'icon_sede_logo');
    setupPreview('input_admin_avatar', 'preview_admin_avatar', 'icon_admin_avatar');
}

function setupPreview(inputId, imgId, iconId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.getElementById(imgId);
                const icon = document.getElementById(iconId);
                img.src = e.target.result;
                img.classList.remove('hidden');
                icon.classList.add('hidden');
            };
            reader.readAsDataURL(file);
        }
    });
}

// ------------------------------------------------------------------
// Saving Logic
// ------------------------------------------------------------------

async function saveSedeData(form) {
    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;

    try {
        btn.innerHTML = 'Guardando...';
        btn.disabled = true;

        const nombre = document.getElementById('conf_nombre_sede').value;
        const direccion = document.getElementById('conf_direccion_sede').value;
        const periodo = document.getElementById('conf_periodo').value;
        const pais = document.getElementById('conf_pais_sede').value;
        const legal = document.getElementById('conf_registro_legal').value;
        const logoFile = document.getElementById('input_sede_logo').files[0];

        // 1. Upload Logo if present
        let logoUrl = null;
        if (logoFile) {
            const fileName = `sede-logo-${Date.now()}-${logoFile.name}`;
            try {
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('configuracion') // Bucket name
                    .upload(fileName, logoFile);

                if (uploadError) throw uploadError;

                const { data: publicUrlData } = supabase.storage
                    .from('configuracion')
                    .getPublicUrl(fileName);

                logoUrl = publicUrlData.publicUrl;
            } catch (err) {
                console.error('Logo Upload Error:', err);
                if (err.message && err.message.includes('Bucket not found')) {
                    throw new Error('El bucket "configuracion" no existe. Favor contactar soporte.');
                }
                throw err;
            }
        }

        // 2. Save Settings
        await saveSetting('nombre_sede', nombre);
        await saveSetting('direccion_sede', direccion);
        await saveSetting('periodo_actual', periodo);
        await saveSetting('pais_sede', pais);
        await saveSetting('registro_legal_sede', legal);
        if (logoUrl) await saveSetting('logo_url_sede', logoUrl);

        if (window.NotificationSystem) NotificationSystem.show('Datos de la sede actualizados', 'success');

    } catch (e) {
        console.error(e);
        if (window.NotificationSystem) NotificationSystem.show('Error al guardar: ' + e.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function saveProfileData(form) {
    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;

    try {
        btn.innerHTML = 'Actualizando...';
        btn.disabled = true;

        const nombres = document.getElementById('profile_nombres').value;
        const apellidos = document.getElementById('profile_apellidos').value;
        const pass = document.getElementById('profile_new_pass').value;
        const avatarFile = document.getElementById('input_admin_avatar').files[0];

        // 1. Confirm sensitive changes
        if (pass) {
            const confirmed = await NotificationSystem.confirm(
                'Cambiar Contraseña',
                '¿Estás seguro de que deseas cambiar tu contraseña?',
                { confirmText: 'Sí, Cambiar' }
            );
            if (!confirmed) {
                btn.disabled = false;
                btn.innerHTML = originalText;
                return;
            }
        }

        // 2. Upload Avatar
        let avatarUrl = null;
        if (avatarFile) {
            const fileName = `avatar-${currentUserId}-${Date.now()}`;
            try {
                const { error: uploadError } = await supabase.storage
                    .from('avatars')
                    .upload(fileName, avatarFile);

                if (uploadError) throw uploadError;

                const { data: publicUrlData } = supabase.storage
                    .from('avatars')
                    .getPublicUrl(fileName);

                avatarUrl = publicUrlData.publicUrl;
            } catch (err) {
                console.error('Avatar Upload Error:', err);
                if (err.message && err.message.includes('Bucket not found')) {
                    throw new Error('El bucket "avatars" no existe. Favor contactar soporte.');
                }
                throw err;
            }
        }

        // 3. Update User (Auth & Table)
        if (pass) {
            const { error: passError } = await supabase.auth.updateUser({ password: pass });
            if (passError) throw passError;
        }

        // Update 'personal_administrativo'
        if (currentAdminId) {
            const { error: updateError } = await supabase
                .from('personal_administrativo')
                .update({ nombres: nombres, apellidos: apellidos })
                .eq('id', currentAdminId);

            if (updateError) throw updateError;
        }

        // Update 'usuarios' (Avatar)
        if (avatarUrl && currentUserId) {
            const { error: userError } = await supabase
                .from('usuarios')
                .update({ url_foto: avatarUrl })
                .eq('id', currentUserId);

            if (userError) throw userError;
        }

        if (window.NotificationSystem) NotificationSystem.show('Perfil actualizado correctamente', 'success');

        // Clear password field
        document.getElementById('profile_new_pass').value = '';

    } catch (e) {
        console.error(e);
        if (window.NotificationSystem) NotificationSystem.show('Error: ' + e.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function setToggle(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = (value === 'true');
}

function setInput(id, value) {
    const el = document.getElementById(id);
    if (el && value) el.value = value;
}

function setupToggleListener(elementId, dbKey) {
    const el = document.getElementById(elementId);
    if (el) {
        el.addEventListener('change', async () => {
            await saveSetting(dbKey, el.checked.toString());
        });
    }
}

async function saveSetting(key, value) {
    const sedeId = store.get().adminContext?.sedeId || window.adminContext?.sedeId;
    if (!sedeId) return;

    try {
        const { error } = await supabase
            .from('configuraciones')
            .upsert({
                clave: key,
                valor: value,
                sede_id: sedeId
            }, { onConflict: 'clave, sede_id' });

        if (error) throw error;
        console.log(`[Settings] Saved ${key}: ${value}`);
    } catch (e) {
        console.error('Error saving setting:', e);
        if (window.NotificationSystem) NotificationSystem.show('Error al guardar configuración', 'error');
    }
}
