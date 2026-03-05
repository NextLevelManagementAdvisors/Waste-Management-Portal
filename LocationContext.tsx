import { createContext, useContext } from 'react';
import { User, Location, UpdateLocationInfo, UpdateProfileInfo, UpdatePasswordInfo, PostNavAction, View } from './types.ts';

export interface LocationContextType {
    user: User | null;
    locations: Location[];
    selectedLocation: Location | null;
    selectedLocationId: string | null;
    setSelectedLocationId: (id: string) => void;
    loading: boolean;
    refreshUser: () => Promise<void>;
    updateLocation: (locationId: string, details: UpdateLocationInfo) => Promise<void>;
    updateProfile: (profileInfo: UpdateProfileInfo) => Promise<void>;
    updatePassword: (passwordInfo: UpdatePasswordInfo) => Promise<void>;
    cancelLocationServices: (locationId: string) => Promise<void>;
    restartLocationServices: (locationId: string) => Promise<void>;
    sendTransferReminder: (locationId: string) => Promise<void>;
    startNewServiceFlow: () => void;
    postNavAction: PostNavAction | null;
    setPostNavAction: (action: PostNavAction | null) => void;
    setCurrentView: (view: View, queryString?: string) => void;
}

export const LocationContext = createContext<LocationContextType>({
    user: null,
    locations: [],
    selectedLocation: null,
    selectedLocationId: null,
    setSelectedLocationId: () => {},
    loading: true,
    refreshUser: async () => {},
    updateLocation: async () => {},
    updateProfile: async () => {},
    updatePassword: async () => {},
    cancelLocationServices: async () => {},
    restartLocationServices: async () => {},
    sendTransferReminder: async () => {},
    startNewServiceFlow: () => {},
    postNavAction: null,
    setPostNavAction: () => {},
    setCurrentView: () => {},
});

export const useLocation = () => useContext(LocationContext);

// Backward-compatible aliases
export const PropertyContext = LocationContext;
export type PropertyContextType = LocationContextType;
export const useProperty = useLocation;
