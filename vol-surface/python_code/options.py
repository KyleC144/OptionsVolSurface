import math as m
from scipy.stats import norm

class BlackScholesCall:
    def callDelta(self, asset_price, asset_volatility, strike_price, time_to_expiration, risk_free_rate):
        b = m.exp(-risk_free_rate*time_to_expiration)
        x1 = m.log(asset_price/(strike_price)) + .5*(asset_volatility*asset_volatility)*time_to_expiration
        x1 = x1/(asset_volatility*(time_to_expiration**.5))
        z1 = norm.cdf(x1)
        return z1

    def callGamma(self, asset_price, asset_volatility, strike_price, time_to_expiration, risk_free_rate):
        b = m.exp(-risk_free_rate*time_to_expiration)
        x1 = m.log(asset_price/(strike_price)) + .5*(asset_volatility*asset_volatility)*time_to_expiration
        x1 = x1/(asset_volatility*(time_to_expiration**.5))
        z1 = norm.cdf(x1)
        z2 = z1/(asset_price*asset_volatility*m.sqrt(time_to_expiration))
        return z2

    def callVega(self, asset_price, asset_volatility, strike_price, time_to_expiration, risk_free_rate):
        b = m.exp(-risk_free_rate*time_to_expiration)
        x1 = m.log(asset_price/(strike_price)) + .5*(asset_volatility*asset_volatility)*time_to_expiration
        x1 = x1/(asset_volatility*(time_to_expiration**.5))
        z1 = norm.pdf(x1)
        z2 = asset_price*z1*m.sqrt(time_to_expiration)
        return z2

    def callTheta(self, asset_price, asset_volatility, strike_price, time_to_expiration, risk_free_rate):
        x1 = m.log(asset_price/(strike_price)) + .5*(asset_volatility*asset_volatility)*time_to_expiration
        x1 = x1/(asset_volatility*(time_to_expiration**.5))
        n1 = -((asset_price*asset_volatility*norm.pdf(x1))/(2*m.sqrt(time_to_expiration)))
        n2 = -(risk_free_rate*strike_price*m.exp(-risk_free_rate*time_to_expiration)*norm.cdf((x1 - (asset_volatility*m.sqrt(time_to_expiration)))))
        return (n1 + n2)/365

    def callPrice(self, asset_price, asset_volatility, strike_price, time_to_expiration, risk_free_rate):
        b = m.exp(-risk_free_rate*time_to_expiration)
        x1 = m.log(asset_price/(strike_price)) + .5*(asset_volatility*asset_volatility)*time_to_expiration
        x1 = x1/(asset_volatility*(time_to_expiration**.5))
        z1 = norm.cdf(x1)
        z1 = z1*asset_price
        x2 = m.log(asset_price/(strike_price)) - .5*(asset_volatility*asset_volatility)*time_to_expiration
        x2 = x2/(asset_volatility*(time_to_expiration**.5))
        z2 = norm.cdf(x2)
        z2 = b*strike_price*z2
        return z1 - z2

    def __init__(self, asset_price, asset_volatility, strike_price, time_to_expiration, risk_free_rate):
        self.asset_price = asset_price
        self.asset_volatility = asset_volatility
        self.strike_price = strike_price
        self.time_to_expiration = time_to_expiration
        self.risk_free_rate = risk_free_rate
        self.price = self.callPrice(asset_price, asset_volatility, strike_price, time_to_expiration, risk_free_rate)
        self.delta = self.callDelta(asset_price, asset_volatility, strike_price, time_to_expiration, risk_free_rate)
        self.gamma = self.callGamma(asset_price, asset_volatility, strike_price, time_to_expiration, risk_free_rate)
        self.vega = self.callVega(asset_price, asset_volatility, strike_price, time_to_expiration, risk_free_rate)
        self.theta = self.callTheta(asset_price, asset_volatility, strike_price, time_to_expiration, risk_free_rate)


class BlackScholesPut:
    def putDelta(self, asset_price, asset_volatility, strike_price, time_to_expiration, risk_free_rate):
        b = m.exp(-risk_free_rate*time_to_expiration)
        x1 = m.log(asset_price/(strike_price)) + .5*(asset_volatility*asset_volatility)*time_to_expiration
        x1 = x1/(asset_volatility*(time_to_expiration**.5))
        z1 = norm.cdf(x1)
        return z1 - 1

    def putGamma(self, asset_price, asset_volatility, strike_price, time_to_expiration, risk_free_rate):
        b = m.exp(-risk_free_rate*time_to_expiration)
        x1 = m.log(asset_price/(strike_price)) + .5*(asset_volatility*asset_volatility)*time_to_expiration
        x1 = x1/(asset_volatility*(time_to_expiration**.5))
        z1 = norm.cdf(x1)
        z2 = z1/(asset_price*asset_volatility*m.sqrt(time_to_expiration))
        return z2

    def putVega(self, asset_price, asset_volatility, strike_price, time_to_expiration, risk_free_rate):
        b = m.exp(-risk_free_rate*time_to_expiration)
        x1 = m.log(asset_price/(strike_price)) + .5*(asset_volatility*asset_volatility)*time_to_expiration
        x1 = x1/(asset_volatility*(time_to_expiration**.5))
        z1 = norm.pdf(x1)
        z2 = asset_price*z1*m.sqrt(time_to_expiration)
        return z2

    def putTheta(self, asset_price, asset_volatility, strike_price, time_to_expiration, risk_free_rate):
        x1 = m.log(asset_price/(strike_price)) + .5*(asset_volatility*asset_volatility)*time_to_expiration
        x1 = x1/(asset_volatility*(time_to_expiration**.5))
        d2 = x1 - asset_volatility*m.sqrt(time_to_expiration)
        n1 = -((asset_price*asset_volatility*norm.pdf(x1))/(2*m.sqrt(time_to_expiration)))
        n2 = -(risk_free_rate*strike_price*m.exp(-risk_free_rate*time_to_expiration)*norm.cdf(-d2))
        return (n1 + n2)/365

    def putPrice(self, asset_price, asset_volatility, strike_price, time_to_expiration, risk_free_rate):
        b = m.exp(-risk_free_rate*time_to_expiration)
        d1 = (m.log(asset_price / strike_price) + (risk_free_rate + 0.5 * asset_volatility**2) * time_to_expiration) / (asset_volatility * m.sqrt(time_to_expiration))
        d2 = d1 - asset_volatility * m.sqrt(time_to_expiration)
        return b * strike_price * norm.cdf(-d2) - asset_price * norm.cdf(-d1)

    def __init__(self, asset_price, asset_volatility, strike_price, time_to_expiration, risk_free_rate):
        self.asset_price = asset_price
        self.asset_volatility = asset_volatility
        self.strike_price = strike_price
        self.time_to_expiration = time_to_expiration
        self.risk_free_rate = risk_free_rate
        self.price = self.putPrice(asset_price, asset_volatility, strike_price, time_to_expiration, risk_free_rate)
        self.delta = self.putDelta(asset_price, asset_volatility, strike_price, time_to_expiration, risk_free_rate)
        self.gamma = self.putGamma(asset_price, asset_volatility, strike_price, time_to_expiration, risk_free_rate)
        self.vega = self.putVega(asset_price, asset_volatility, strike_price, time_to_expiration, risk_free_rate)
        self.theta = self.putTheta(asset_price, asset_volatility, strike_price, time_to_expiration, risk_free_rate)