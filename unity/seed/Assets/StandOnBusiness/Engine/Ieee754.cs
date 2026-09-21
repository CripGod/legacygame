using System;

namespace StandOnBusiness.Engine
{
    /// <summary>
    /// The exponential the web engine's JavaScript runtime computes (V8's port of fdlibm's e_exp.c). The AI scores
    /// boards through a sigmoid, and two scores a hair apart decide which plan it takes, so the C# side must get the
    /// same last bit as the recorded traces on every platform. Only IEEE double adds, multiplies, divides and bit
    /// assembly are used, all of which are exact and identical everywhere.
    /// </summary>
    public static class Ieee754
    {
        const double One = 1.0;
        const double Huge = 1.0e+300;
        const double Twom1000 = 9.33263618503218878990e-302; // 2**-1000
        const double OThreshold = 7.09782712893383973096e+02;
        const double UThreshold = -7.45133219101941108420e+02;
        const double Ln2Hi = 6.93147180369123816490e-01;
        const double Ln2Lo = 1.90821492927058770002e-10;
        const double InvLn2 = 1.44269504088896338700e+00;
        const double P1 = 1.66666666666666019037e-01;
        const double P2 = -2.77777777770155933842e-03;
        const double P3 = 6.61375632143793436117e-05;
        const double P4 = -1.65339022054652515390e-06;
        const double P5 = 4.13813679705723846039e-08;
        const double TwoP1023 = 8.98846567431157953865e+307; // 2**1023
        const double E = 2.718281828459045;

        static uint HighWord(double x) => (uint)(BitConverter.DoubleToInt64Bits(x) >> 32);
        static uint LowWord(double x) => (uint)BitConverter.DoubleToInt64Bits(x);
        static double FromWords(uint hi, uint lo) => BitConverter.Int64BitsToDouble(((long)hi << 32) | lo);

        public static double Exp(double x)
        {
            double y, hi = 0, lo = 0, c, t, twopk;
            int k = 0;
            uint hx = HighWord(x);
            int xsb = (int)((hx >> 31) & 1);
            hx &= 0x7fffffff;

            if (hx >= 0x40862E42)
            {
                if (hx >= 0x7ff00000)
                {
                    if (((hx & 0xfffff) | LowWord(x)) != 0) return x + x; // NaN
                    return xsb == 0 ? x : 0.0; // +inf or -inf
                }
                if (x > OThreshold) return Huge * Huge;
                if (x < UThreshold) return Twom1000 * Twom1000;
            }

            if (hx > 0x3fd62e42)
            {
                if (hx < 0x3FF0A2B2)
                {
                    // V8 special-cases exp(1): the reduction below gets its last bit wrong.
                    if (x == 1.0) return E;
                    hi = x - (xsb == 0 ? Ln2Hi : -Ln2Hi);
                    lo = xsb == 0 ? Ln2Lo : -Ln2Lo;
                    k = 1 - xsb - xsb;
                }
                else
                {
                    k = (int)(InvLn2 * x + (xsb == 0 ? 0.5 : -0.5));
                    t = k;
                    hi = x - t * Ln2Hi;
                    lo = t * Ln2Lo;
                }
                x = hi - lo;
            }
            else if (hx < 0x3e300000)
            {
                if (Huge + x > One) return One + x;
            }
            else k = 0;

            t = x * x;
            if (k >= -1021) twopk = FromWords(unchecked((uint)(0x3ff00000 + (k << 20))), 0);
            else twopk = FromWords(unchecked((uint)(0x3ff00000 + ((k + 1000) << 20))), 0);
            c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
            if (k == 0) return One - ((x * c) / (c - 2.0) - x);
            y = One - ((lo - (x * c) / (2.0 - c)) - hi);
            if (k >= -1021)
            {
                if (k == 1024) return y * 2.0 * TwoP1023;
                return y * twopk;
            }
            return y * twopk * Twom1000;
        }
    }
}
