import React from 'react';
import Billing from './Billing.tsx';
import Subscriptions from './Subscriptions.tsx';
import AutopaySettings from './AutopaySettings.tsx';

const BillingHub: React.FC = () => {
    return (
        <div className="space-y-12">
            <AutopaySettings />
            <Billing />
            <Subscriptions />
        </div>
    );
};

export default BillingHub;