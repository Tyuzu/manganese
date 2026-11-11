import { button, div, h1, h2, p, span } from '../components/ui/dom';
import { router } from '../main';
import { listFarms } from '../services/farmServices';
import { getCropCatalogue, getCropCatalogueByType } from '../services/cropServices';

const CROP_TYPES = ['grains', 'vegetables', 'fruits', 'legumes'];

function titleCase(value: string): string {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeCropName(value: string): string {
  return decodeURIComponent(value || '').trim();
}

async function renderCropDetailPage(cropName: string): Promise<HTMLElement> {
  const root = div({ className: 'card' });
  const cleanedName = normalizeCropName(cropName);

  const backButton = button({
    type: 'button',
    className: 'btn-secondary',
    onClick: () => router.navigate('/crops')
  }, '← Back to catalogue');

  root.appendChild(backButton);

  try {
    const catalog = await getCropCatalogue();
    const cropMatch = Object.values(catalog)
      .flat()
      .find((crop) => crop.name.toLowerCase() === cleanedName.toLowerCase());

    const detailHeader = div({ className: 'crop-detail-header' },
      h1({}, cropMatch?.name || cleanedName),
      div({ className: 'stat-grid' },
        div({ className: 'stat-pill' }, span({ className: 'stat-label' }, 'Type'), span({ className: 'stat-value' }, cropMatch?.type || 'General')),
        div({ className: 'stat-pill' }, span({ className: 'stat-label' }, 'Water'), span({ className: 'stat-value' }, cropMatch?.waterRequirement || 'Not specified')),
        div({ className: 'stat-pill' }, span({ className: 'stat-label' }, 'Description'), span({ className: 'stat-value' }, cropMatch?.description ? 'Available' : 'Details pending'))
      )
    );

    root.appendChild(detailHeader);

    if (cropMatch?.description) {
      root.appendChild(p({ className: 'crop-summary' }, cropMatch.description));
    }

    const farms = await listFarms();
    const matchingFarms = farms.filter((farm) => {
      const farmCrops = [farm.crop, ...(farm.crops || [])].filter(Boolean).map((item) => item.toLowerCase());
      return farmCrops.includes(cleanedName.toLowerCase());
    });

    if (!matchingFarms.length) {
      root.appendChild(p({}, `No farms are currently selling ${cleanedName}.`));
      return root;
    }

    const summary = p({ className: 'section-title' }, `${matchingFarms.length} farm${matchingFarms.length === 1 ? '' : 's'} currently sell ${cleanedName}.`);
    root.appendChild(summary);

    const list = div({ className: 'farm-list' });
    matchingFarms.forEach((farm) => {
      const farmCard = div({ className: 'farm-item' },
        div({ className: 'farm-item-header' },
          h2({}, farm.name),
          span({ className: 'status-badge' }, farm.status)
        ),
        p({}, `Primary crop: ${farm.crop || 'N/A'}`),
        p({}, farm.crops && farm.crops.length ? `Other crops: ${farm.crops.join(', ')}` : 'No other crops listed'),
        button({
          type: 'button',
          className: 'btn-secondary farm-button',
          onClick: () => router.navigate(`/farms/${farm.id}`)
        }, 'View farm')
      );

      list.appendChild(farmCard);
    });

    root.appendChild(list);
  } catch (err: any) {
    root.appendChild(p({ className: 'error' }, `Unable to load farms for ${cleanedName}: ${err.message}`));
  }

  return root;
}

export async function createCropCataloguePage(selectedType?: string): Promise<HTMLElement> {
  const normalizedInput = normalizeCropName(selectedType || '');

  if (normalizedInput && !CROP_TYPES.includes(normalizedInput.toLowerCase())) {
    return renderCropDetailPage(normalizedInput);
  }

  const root = div({ className: 'card' }, h1({}, 'Crop Catalogue'));
  const tabBar = div({ className: 'tab-button-row', role: 'tablist', 'aria-label': 'Crop types' });
  const content = div({ className: 'tab-content-panel' });

  const activeKey = 'crop-catalogue-active-tab';
  const defaultType = CROP_TYPES.includes((normalizedInput || sessionStorage.getItem(activeKey) || '').toLowerCase())
    ? normalizedInput.toLowerCase()
    : sessionStorage.getItem(activeKey) || CROP_TYPES[0];

  let activeTab = CROP_TYPES.includes(defaultType) ? defaultType : CROP_TYPES[0];

  const tabMap = new Map<string, HTMLButtonElement>();
  const panelMap = new Map<string, HTMLElement>();

  for (const cropType of CROP_TYPES) {
    const tabButton = button({
      type: 'button',
      role: 'tab',
      'aria-selected': cropType === activeTab ? 'true' : 'false'
    }, titleCase(cropType));

    const panel = div({ className: 'tab-panel' }, p({}, 'Loading crop catalogue...'));
    tabMap.set(cropType, tabButton);
    panelMap.set(cropType, panel);

    tabButton.addEventListener('click', async () => {
      activeTab = cropType;
      sessionStorage.setItem(activeKey, cropType);
      renderTabs();
      await refreshPanel(cropType, panel);
    });

    tabBar.appendChild(tabButton);
    content.appendChild(panel);
  }

  root.appendChild(tabBar);
  root.appendChild(content);

  const renderTabs = () => {
    for (const [cropType, buttonEl] of tabMap.entries()) {
      const isActive = cropType === activeTab;
      buttonEl.setAttribute('aria-selected', String(isActive));
      buttonEl.classList.toggle('active', isActive);
    }

    for (const [cropType, panel] of panelMap.entries()) {
      panel.classList.toggle('active', cropType === activeTab);
    }
  };

  const refreshPanel = async (cropType: string, panel: HTMLElement) => {
    panel.replaceChildren(p({}, 'Loading crop catalogue...'));

    try {
      const crops = await getCropCatalogueByType(cropType);
      if (!crops.length) {
        panel.replaceChildren(p({}, `No crops available for ${titleCase(cropType)}.`));
        return;
      }

      const list = div({ className: 'crop-list' });
      for (const crop of crops) {
        const item = div({ className: 'crop-card' },
          h2({}, crop.name),
          p({}, span({ className: 'label' }, 'Type: '), crop.type),
          p({}, span({ className: 'label' }, 'Water: '), crop.waterRequirement),
          p({}, crop.description),
          button({
            type: 'button',
            onClick: () => router.navigate(`/crops/${encodeURIComponent(crop.name)}`)
          }, 'View farms')
        );
        list.appendChild(item);
      }
      panel.replaceChildren(list);
    } catch (err: any) {
      panel.replaceChildren(p({ className: 'error' }, `Unable to load ${titleCase(cropType)} catalogue: ${err.message}`));
    }
  };

  renderTabs();
  await refreshPanel(activeTab, panelMap.get(activeTab) || content);

  return root;
}
