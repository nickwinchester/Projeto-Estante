const root = document.getElementById('root');
if (!root || (!root.dataset.home && !root.dataset.admin)) {
  // This module is shared by the home page and the admin tools page.
} else {
  const fontOptions = [
    ['default', 'Fonte padrão'],
    ['Cinzel Decorative', 'Cinzel Decorative'],
    ['Berkshire Swash', 'Berkshire Swash'],
    ['Cormorant Garamond', 'Cormorant Garamond'],
    ['UnifrakturCook', 'UnifrakturCook'],
    ['Playfair Display', 'Playfair Display'],
    ['DM Serif Display', 'DM Serif Display'],
    ['Bodoni Moda', 'Bodoni Moda'],
  ];

  const textFields = [
    { key: 'siteName', label: 'Nome do site', selector: '.home-page .topbar .brand' },
    { key: 'homeLabel', label: 'Identificação da estante', selector: '.home-page .home-copy > .eyebrow' },
    { key: 'homeTitle', label: 'Título principal', selector: '.home-page .home-copy > h1' },
    { key: 'introMessage', label: 'Apresentação', selector: '.home-page .home-copy > p:not(.eyebrow):not(.home-signoff)' },
    { key: 'homeSignoff', label: 'Frase de encerramento', selector: '.home-page .home-copy > .home-signoff' },
  ];

  const imageFields = [
    { key: 'siteIcon', label: 'Ícone superior esquerdo', help: 'Imagem exibida no atalho do canto superior.' },
    { key: 'photo', label: 'Foto principal / perfil', help: 'Foto exibida na apresentação do perfil.' },
    { key: 'favicon', label: 'Favicon', help: 'Ícone exibido na aba do navegador.' },
  ];

  const defaultIconLinks = Array.from(document.querySelectorAll('link[rel~="icon"]'), (link) => ({
    href: link.getAttribute('href'),
    type: link.getAttribute('type'),
  }));
  const defaultFavicon = defaultIconLinks[0]?.href || './favicon.svg';
  let profile = {};
  let appearancePanel = null;

  function setFontLink() {
    if (document.getElementById('home-appearance-fonts')) return;
    const usesCustomFont = textFields.some((field) => {
      const font = profile.homeTextStyles?.[field.key]?.font;
      return font && font !== 'default';
    });
    if (!usesCustomFont) return;
    const fontLink = document.createElement('link');
    fontLink.id = 'home-appearance-fonts';
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Berkshire+Swash&family=Bodoni+Moda:opsz,wght@6..96,400;6..96,700&family=Cinzel+Decorative:wght@400;700;900&family=Cormorant+Garamond:wght@400;500;600;700&family=DM+Serif+Display&family=Playfair+Display:wght@400;500;600;700&family=UnifrakturCook:wght@700&display=swap';
    document.head.append(fontLink);
  }

  function applyStyles() {
    const styles = profile.homeTextStyles || {};
    for (const field of textFields) {
      const setting = styles[field.key] || {};
      for (const element of document.querySelectorAll(field.selector)) {
        if (setting.font && setting.font !== 'default') {
          element.style.fontFamily = `"${setting.font}", serif`;
        } else {
          element.style.removeProperty('font-family');
        }
        if (setting.color) {
          element.style.color = setting.color;
        } else {
          element.style.removeProperty('color');
        }
      }
    }

    const avatarLink = document.querySelector('.home-page .topbar .avatar-link');
    const iconSource = profile.siteIcon || profile.favicon || defaultFavicon;
    if (avatarLink) {
      let avatar = avatarLink.querySelector('img.avatar');
      if (!avatar) {
        avatar = document.createElement('img');
        avatar.className = 'avatar';
        avatar.alt = 'Ícone da estante';
        avatarLink.replaceChildren(avatar);
      }
      if (avatar.getAttribute('src') !== iconSource) avatar.src = iconSource;
    }

    document.querySelectorAll('link[rel~="icon"]').forEach((link, index) => {
      if (profile.favicon) {
        link.href = profile.favicon;
        link.type = 'image/png';
      } else {
        const original = defaultIconLinks[index];
        link.href = original?.href || defaultFavicon;
        if (original?.type) link.type = original.type;
        else link.removeAttribute('type');
      }
    });

  }

  function element(tagName, className, text) {
    const item = document.createElement(tagName);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }

  function attachEditor() {
    if (!appearancePanel) return;
    const form = document.querySelector('.profile-modal form');
    const introField = form?.querySelector('label.form-label');
    if (form && introField && appearancePanel.parentElement !== form) {
      introField.insertAdjacentElement('afterend', appearancePanel);
    }
    document.querySelectorAll('.home-appearance-editor').forEach((panel) => {
      if (panel !== appearancePanel || !panel.closest('.profile-modal')) panel.remove();
    });
  }

  function currentImage(key) {
    if (profile[key]) return profile[key];
    return key === 'favicon' ? defaultFavicon : './favicon.svg';
  }

  async function imageData(file, key) {
    if (file.size > 15_000_000) throw new Error('Escolha uma imagem menor que 15 MB.');
    const bitmap = await createImageBitmap(file);
    const maxDimension = key === 'photo' ? 1400 : key === 'favicon' ? 256 : 512;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível processar a imagem.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const type = key === 'favicon' || (key === 'siteIcon' && file.type === 'image/png') ? 'image/png' : 'image/jpeg';
    const result = canvas.toDataURL(type, 0.88);
    if (result.length > 2_500_000) throw new Error('A imagem processada ficou grande demais. Escolha outra imagem.');
    return result;
  }

  function createImageControl(field) {
    const control = element('div', 'home-appearance-image');
    const label = element('label', 'home-appearance-label', field.label);
    const preview = element('img', 'home-appearance-preview');
    preview.src = currentImage(field.key);
    preview.alt = `Prévia: ${field.label}`;

    const input = element('input', 'home-appearance-file');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('aria-label', `Selecionar ${field.label.toLowerCase()}`);
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        profile[field.key] = await imageData(file, field.key);
        preview.src = profile[field.key];
        applyStyles();
      } catch (error) {
        status.textContent = error.message || 'Não foi possível processar a imagem.';
      }
    });

    const clearButton = element('button', 'home-appearance-clear', 'Remover imagem');
    clearButton.type = 'button';
    clearButton.addEventListener('click', () => {
      profile[field.key] = '';
      preview.src = currentImage(field.key);
      input.value = '';
      applyStyles();
    });

    label.append(input);
    control.append(label, element('p', 'home-appearance-help', field.help), preview, clearButton);
    return control;
  }

  function createTextControl(field) {
    const settings = profile.homeTextStyles?.[field.key] || {};
    const fieldset = element('fieldset', 'home-appearance-text');
    fieldset.append(element('legend', '', field.label));

    const fontLabel = element('label', 'home-appearance-label', 'Fonte');
    const fontSelect = element('select', 'home-appearance-select');
    for (const [value, label] of fontOptions) {
      const option = element('option', '', label);
      option.value = value;
      fontSelect.append(option);
    }
    fontSelect.value = settings.font || 'default';
    fontLabel.append(fontSelect);

    const colorLabel = element('label', 'home-appearance-label', 'Cor do texto');
    const colorInput = element('input', 'home-appearance-color');
    colorInput.type = 'color';
    colorInput.value = settings.color || '#342c2d';
    colorLabel.append(colorInput);

    const preview = element('p', 'home-appearance-sample', 'Prévia do texto');
    const update = () => {
      profile.homeTextStyles ||= {};
      profile.homeTextStyles[field.key] = { font: fontSelect.value, color: colorInput.value };
      setFontLink();
      preview.style.color = colorInput.value;
      preview.style.fontFamily = fontSelect.value === 'default' ? '' : `"${fontSelect.value}", serif`;
      applyStyles();
    };
    fontSelect.addEventListener('change', update);
    colorInput.addEventListener('input', update);
    fieldset.append(fontLabel, colorLabel, preview);
    return fieldset;
  }

  const status = element('p', 'home-appearance-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  function createEditor() {
    if (appearancePanel) return;
    document.body.classList.add('home-appearance-available');

    const panel = element('section', 'home-appearance-editor');
    appearancePanel = panel;
    panel.id = 'home-appearance-settings';
    panel.setAttribute('aria-labelledby', 'home-appearance-title');
    const heading = element('h2', '', 'Aparência da página inicial');
    heading.id = 'home-appearance-title';
    panel.append(heading, element('p', 'home-appearance-intro', 'Configure o ícone, as imagens e o estilo de cada texto da home.'));

    const imageSection = element('div', 'home-appearance-images');
    for (const field of imageFields) imageSection.append(createImageControl(field));
    panel.append(element('h3', '', 'Imagens'), imageSection);

    const textSection = element('div', 'home-appearance-texts');
    for (const field of textFields) textSection.append(createTextControl(field));
    panel.append(element('h3', '', 'Fonte e cor por texto'), textSection);

    const saveButton = element('button', 'home-appearance-save', 'Salvar aparência');
    saveButton.type = 'button';
    saveButton.addEventListener('click', async () => {
      saveButton.disabled = true;
      status.textContent = 'Salvando…';
      try {
        const response = await fetch('./api.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'save-profile', profile }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Não foi possível salvar as configurações.');
        profile = result.profile;
        applyStyles();
        status.textContent = 'Aparência salva.';
      } catch (error) {
        status.textContent = error.message || 'Não foi possível salvar as configurações.';
      } finally {
        saveButton.disabled = false;
      }
    });
    panel.append(saveButton, status);
    attachEditor();
    applyStyles();
  }

  async function initialize() {
    try {
      const [authResponse, profileResponse] = await Promise.all([
        fetch('./auth.php'),
        fetch('./api.php'),
      ]);
      if (!authResponse.ok || !profileResponse.ok) return;
      const [auth, data] = await Promise.all([authResponse.json(), profileResponse.json()]);
      profile = data.profile || {};
      setFontLink();
      applyStyles();
      new MutationObserver(() => {
        applyStyles();
        attachEditor();
      }).observe(root, { childList: true, subtree: true });
      if (auth.authenticated) createEditor();
    } catch (error) {
      console.error('Não foi possível carregar as configurações de aparência.', error);
    }
  }

  initialize();
}