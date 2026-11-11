import { button, div, form, h2, input, label, p, span } from '../components/ui/dom';
import { router } from '../main';
import { addCropToFarm, deleteFarm, getFarmDetails, removeCropFromFarm, updateFarm } from '../services/farmServices';

export async function createFarmDetailsPage(farmID: string): Promise<HTMLElement> {
  const card = div({ className: 'card' },
    h2({}, `Farm Details (ID: ${farmID})`),
    div({}, 'Loading farm data from backend...')
  );

  try {
    const data = await getFarmDetails(farmID);
    const contentEl = div({});
    const details = div({},
      p({}, span({ style: 'font-weight: bold;' }, 'Name: '), data.name),
      p({}, span({ style: 'font-weight: bold;' }, 'Primary Crop: '), data.crop || 'N/A'),
      p({}, span({ style: 'font-weight: bold;' }, 'Status: '), data.status),
      p({}, span({ style: 'font-weight: bold;' }, 'Crops: '), (data.crops && data.crops.length ? data.crops.join(', ') : (data.crop ? data.crop : 'None')))
    );

    const updateForm = form({
      onSubmit: async (event: Event) => {
        event.preventDefault();
        const formEl = event.currentTarget as HTMLFormElement;
        const formData = new FormData(formEl);

        try {
          await updateFarm(farmID, {
            name: String(formData.get('name') || data.name),
            crop: String(formData.get('crop') || data.crop || ''),
            status: String(formData.get('status') || data.status),
          });
          const refreshed = await getFarmDetails(farmID);
          const page = await createFarmDetailsPage(farmID);
          card.replaceWith(page);
          if (refreshed) {
            return;
          }
        } catch (err: any) {
          window.alert(err.message || 'Unable to update farm');
        }
      }
    },
      label({}, 'Farm Name'),
      input({ name: 'name', type: 'text', value: data.name }),
      label({}, 'Primary Crop'),
      input({ name: 'crop', type: 'text', value: data.crop || '' }),
      label({}, 'Status'),
      input({ name: 'status', type: 'text', value: data.status }),
      button({ type: 'submit' }, 'Save Changes')
    );

    const cropForm = form({
      onSubmit: async (event: Event) => {
        event.preventDefault();
        const formEl = event.currentTarget as HTMLFormElement;
        const cropName = String(new FormData(formEl).get('cropName') || '').trim();
        if (!cropName) {
          return;
        }
        try {
          await addCropToFarm(farmID, cropName);
          const refreshed = await createFarmDetailsPage(farmID);
          card.replaceWith(refreshed);
        } catch (err: any) {
          window.alert(err.message || 'Unable to add crop');
        }
      }
    },
      label({}, 'Add Crop'),
      input({ name: 'cropName', type: 'text', placeholder: 'e.g. Corn' }),
      button({ type: 'submit' }, 'Add Crop')
    );

    const cropList = div({});
    const crops = data.crops && data.crops.length ? data.crops : [data.crop].filter(Boolean);
    crops.forEach((crop) => {
      const cropRow = div({}, span({}, crop), button({ type: 'button' }, 'Remove'));
      cropRow.lastElementChild?.addEventListener('click', async () => {
        try {
          await removeCropFromFarm(farmID, crop);
          const refreshed = await createFarmDetailsPage(farmID);
          card.replaceWith(refreshed);
        } catch (err: any) {
          window.alert(err.message || 'Unable to remove crop');
        }
      });
      cropList.appendChild(cropRow);
    });

    const deleteBtn = button({
      type: 'button',
      style: 'background: #dc2626; color: white; margin-top: 12px;'
    }, 'Delete Farm');
    deleteBtn.addEventListener('click', async () => {
      if (!window.confirm(`Delete ${data.name}?`)) {
        return;
      }
      try {
        await deleteFarm(farmID);
        router.navigate('/farms');
      } catch (err: any) {
        window.alert(err.message || 'Unable to delete farm');
      }
    });

    contentEl.replaceChildren(details, updateForm, cropForm, cropList, deleteBtn);
    card.replaceChildren(h2({}, `Farm Details (ID: ${farmID})`), contentEl);
  } catch (err: any) {
    card.replaceChildren(
      h2({}, `Farm Details (ID: ${farmID})`),
      p({ className: 'error' }, `Failed to load: ${err.message}`)
    );
  }

  return card;
}