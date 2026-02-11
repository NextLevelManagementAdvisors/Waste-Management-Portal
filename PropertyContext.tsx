import { createContext, useContext } from 'react';
import { User, Property, UpdatePropertyInfo, UpdateProfileInfo, UpdatePasswordInfo, PostNavAction, View } from './types.ts';

export interface PropertyContextType {
    user: User | null;
    properties: Property[];
    selectedProperty: Property | null;
    selectedPropertyId: string | null;
    setSelectedPropertyId: (id: string) => void;
    loading: boolean;
    refreshUser: () => Promise<void>;
    updateProperty: (propertyId: string, details: UpdatePropertyInfo) => Promise<void>;
    updateProfile: (profileInfo: UpdateProfileInfo) => Promise<void>;
    updatePassword: (passwordInfo: UpdatePasswordInfo) => Promise<void>;
    cancelPropertyServices: (propertyId: string) => Promise<void>;
    restartPropertyServices: (propertyId: string) => Promise<void>;
    sendTransferReminder: (propertyId: string) => Promise<void>;
    startNewServiceFlow: () => void;
    postNavAction: PostNavAction | null;
    setPostNavAction: (action: PostNavAction | null) => void;
    setCurrentView: (view: View) => void;
}

export const PropertyContext = createContext<PropertyContextType>({
    user: null,
    properties: [],
    selectedProperty: null,
    selectedPropertyId: null,
    setSelectedPropertyId: () => {},
    loading: true,
    refreshUser: async () => {},
    updateProperty: async () => {},
    updateProfile: async () => {},
    updatePassword: async () => {},
    cancelPropertyServices: async () => {},
    restartPropertyServices: async () => {},
    sendTransferReminder: async () => {},
    startNewServiceFlow: () => {},
    postNavAction: null,
    setPostNavAction: () => {},
    setCurrentView: () => {},
});

export const useProperty = () => useContext(PropertyContext);