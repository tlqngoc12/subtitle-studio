package com.subtitlestudio.novel;

import java.math.BigInteger;
import java.util.Comparator;

/** Orders file names the way people read them: "Screenshot (2)" before "Screenshot (10)", ignoring case. */
public final class NaturalOrder {

    public static final Comparator<String> COMPARATOR = Comparator.nullsFirst(NaturalOrder::compare);

    private NaturalOrder() {
    }

    private static int compare(String a, String b) {
        int i = 0;
        int j = 0;
        while (i < a.length() && j < b.length()) {
            char ca = a.charAt(i);
            char cb = b.charAt(j);
            if (Character.isDigit(ca) && Character.isDigit(cb)) {
                int ei = digitsEnd(a, i);
                int ej = digitsEnd(b, j);
                int cmp = new BigInteger(a.substring(i, ei)).compareTo(new BigInteger(b.substring(j, ej)));
                if (cmp != 0) {
                    return cmp;
                }
                i = ei;
                j = ej;
            } else {
                int cmp = Character.compare(Character.toLowerCase(ca), Character.toLowerCase(cb));
                if (cmp != 0) {
                    return cmp;
                }
                i++;
                j++;
            }
        }
        int cmp = Integer.compare(a.length() - i, b.length() - j);
        return cmp != 0 ? cmp : a.compareTo(b);
    }

    private static int digitsEnd(String s, int from) {
        int k = from;
        while (k < s.length() && Character.isDigit(s.charAt(k))) {
            k++;
        }
        return k;
    }
}
