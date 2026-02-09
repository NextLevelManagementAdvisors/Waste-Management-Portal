
import React from 'react';
import Billing from './Billing.tsx';
import Subscriptions from './Subscriptions.tsx';

const BillingHub: React.FC = () => {
    return (
        <div className="space-y-12">
            <Billing />
            <Subscriptions />
        </div>
    );
};

export default BillingHub;
