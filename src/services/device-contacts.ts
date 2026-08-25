import {
  getPermissionsAsync,
  requestPermissionsAsync,
  presentContactPickerAsync,
  getContactByIdAsync,
  Fields,
  Contact as ExpoContact,
  ExistingContact,
} from 'expo-contacts/legacy';

export type DeviceContact = {
  id: string;
  name: string;
  phone: string;
  avatarUri?: string;
};

/**
 * Helper to transform an Expo Contact object into a simplified DeviceContact format.
 */
function mapContact(contact: ExistingContact | ExpoContact): DeviceContact | undefined {
  const phone = contact.phoneNumbers && contact.phoneNumbers.length > 0
    ? contact.phoneNumbers[0].number
    : undefined;

  if (!phone) {
    return undefined;
  }

  const name =
    contact.name ||
    [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
    phone;

  const avatarUri = contact.imageAvailable && contact.image?.uri
    ? contact.image.uri
    : (contact.rawImage?.uri || undefined);

  const contactId = 'id' in contact && typeof contact.id === 'string' ? contact.id : '';

  return {
    id: contactId,
    name,
    phone,
    avatarUri,
  };
}

/** Opens the platform's own contact-picker UI after requesting contacts permission. */
export async function pickDeviceContact(): Promise<DeviceContact | undefined> {
  const existing = await getPermissionsAsync();
  const permission = existing.granted ? existing : await requestPermissionsAsync();

  if (!permission.granted) {
    throw new Error('Contacts permission was not granted.');
  }

  const selected = await presentContactPickerAsync();
  return selected ? mapContact(selected) : undefined;
}

/** Reads the latest values for an existing linked native contact. */
export async function getDeviceContact(id: string): Promise<DeviceContact | undefined> {
  if (!id) return undefined;

  const existing = await getPermissionsAsync();
  if (!existing.granted) {
    return undefined;
  }

  try {
    const contact = await getContactByIdAsync(id, [
      Fields.Name,
      Fields.FirstName,
      Fields.LastName,
      Fields.PhoneNumbers,
      Fields.Image,
    ]);

    return contact ? mapContact(contact) : undefined;
  } catch (error) {
    console.warn(`Failed to fetch device contact [${id}]:`, error);
    return undefined;
  }
}
