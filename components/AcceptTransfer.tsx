import React, { useState, useEffect } from 'react';
import { Button } from './Button.tsx';
import { Card } from './Card.tsx';
import { HomeModernIcon, CheckCircleIcon, ExclamationTriangleIcon } from './Icons.tsx';

interface TransferDetails {
  propertyId: string;
  address: string;
  serviceType: string;
  newOwner: { firstName: string; lastName: string; email: string };
}

interface AcceptTransferProps {
  token: string;
  isAuthenticated: boolean;
  onAccepted: () => void;
  onSwitchToLogin: (prefill?: { email?: string }) => void;
  onSwitchToRegister: (prefill?: { firstName?: string; lastName?: string; email?: string }) => void;
}

const AcceptTransfer: React.FC<AcceptTransferProps> = ({
  token,
  isAuthenticated,
  onAccepted,
  onSwitchToLogin,
  onSwitchToRegister,
}) => {
  const [details, setDetails] = useState<TransferDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    fetch(`/api/account-transfer/${token}`)
      .then(async res => {
        const json = await res.json();
        if (!res.ok || json.error) {
          setError(json.error || 'Transfer invitation not found or expired.');
        } else {
          setDetails(json.data);
        }
      })
      .catch(() => setError('Failed to load transfer details.'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (isAuthenticated && details && !accepted && !accepting) {
      acceptTransfer();
    }
  }, [isAuthenticated, details]);

  const acceptTransfer = async () => {
    setAccepting(true);
    setError(null);
    try {
      const res = await fetch(`/api/account-transfer/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to accept transfer.');
      } else {
        setAccepted(true);
        setTimeout(() => onAccepted(), 2000);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-100">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error && !details) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-100 p-4">
        <Card className="max-w-md w-full text-center py-12">
          <ExclamationTriangleIcon className="mx-auto h-16 w-16 text-amber-500 mb-4" />
          <h2 className="text-2xl font-black text-gray-900 mb-2">Transfer Not Found</h2>
          <p className="text-gray-500 mb-6">This transfer invitation may have expired or already been accepted.</p>
          <Button onClick={() => window.location.href = '/login'}>Go to Login</Button>
        </Card>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-100 p-4">
        <Card className="max-w-md w-full text-center py-12">
          <CheckCircleIcon className="mx-auto h-16 w-16 text-primary mb-4" />
          <h2 className="text-2xl font-black text-gray-900 mb-2">Transfer Complete!</h2>
          <p className="text-gray-500 mb-2">You now manage the service at:</p>
          <p className="text-lg font-bold text-gray-800">{details?.address}</p>
          <p className="text-sm text-gray-400 mt-4">Redirecting to your dashboard...</p>
        </Card>
      </div>
    );
  }

  if (isAuthenticated && accepting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-100 p-4">
        <Card className="max-w-md w-full text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
          <h2 className="text-xl font-bold text-gray-900">Accepting Transfer...</h2>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-100 p-4">
      <Card className="max-w-lg w-full py-8 px-6">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <HomeModernIcon className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-black text-gray-900 mb-2">Service Transfer Invitation</h2>
          <p className="text-gray-500">You've been invited to take over waste management service.</p>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 mb-6">
          <p className="text-sm text-gray-500 mb-1">Property Address</p>
          <p className="text-lg font-bold text-gray-900">{details?.address}</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>
        )}

        {!isAuthenticated && (
          <div className="space-y-4">
            <p className="text-center text-sm text-gray-600">
              To accept this transfer, please create an account or sign in.
            </p>
            <Button
              onClick={() => onSwitchToRegister({
                firstName: details?.newOwner?.firstName,
                lastName: details?.newOwner?.lastName,
                email: details?.newOwner?.email,
              })}
              className="w-full rounded-xl font-bold py-3"
            >
              Create an Account
            </Button>
            <Button
              variant="secondary"
              onClick={() => onSwitchToLogin({ email: details?.newOwner?.email })}
              className="w-full rounded-xl font-bold py-3"
            >
              I Already Have an Account
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AcceptTransfer;
