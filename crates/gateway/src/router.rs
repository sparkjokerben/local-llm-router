use crate::config::Route;

/// Routes a requested model string to a provider id.
///
/// Matching: the first route whose `model` equals the requested model wins
/// (order in config). A literal `"*"` route is the fallback and only fires if
/// no exact match was found, regardless of its position. `[1M]`-style context
/// suffixes are stripped before comparing, so `deepseek-v4-flash` matches
/// `deepseek-v4-flash[1M]` and vice versa.
pub struct Router {
    entries: Vec<Route>,
}

impl Router {
    pub fn new(routes: Vec<Route>) -> Self {
        Self { entries: routes }
    }

    pub fn route(&self, model: &str) -> Option<&Route> {
        let mut fallback = None;
        for r in &self.entries {
            if r.model == "*" {
                fallback = Some(r);
            } else if matches(r.model.as_str(), model) {
                return Some(r);
            }
        }
        fallback
    }

    /// Distinct model ids from all routes (excluding the `*` fallback), in
    /// config order. Exposed to downstream clients via `/v1/models` so tools
    /// like cc-switch can discover which models the gateway can route.
    pub fn models(&self) -> Vec<String> {
        let mut seen = std::collections::HashSet::new();
        let mut out = Vec::new();
        for r in &self.entries {
            if r.model == "*" || !seen.insert(&r.model) {
                continue;
            }
            out.push(r.model.clone());
        }
        out
    }
}

fn strip_ctx(name: &str) -> &str {
    name.split_once('[').map_or(name, |(base, _)| base)
}

fn matches(route_model: &str, model: &str) -> bool {
    route_model == model || strip_ctx(route_model) == strip_ctx(model)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn routes() -> Vec<Route> {
        vec![
            Route { model: "a".into(), provider: "p1".into() },
            Route { model: "b".into(), provider: "p2".into() },
            Route { model: "*".into(), provider: "p0".into() },
        ]
    }

    #[test]
    fn exact_match_wins() {
        let r = Router::new(routes());
        assert_eq!(r.route("a").unwrap().provider, "p1");
        assert_eq!(r.route("b").unwrap().provider, "p2");
    }

    #[test]
    fn fallback_used_for_unknown() {
        let r = Router::new(routes());
        assert_eq!(r.route("zzz").unwrap().provider, "p0");
    }

    #[test]
    fn fallback_position_does_not_shadow_exact() {
        let mut rs = vec![Route { model: "*".into(), provider: "p0".into() }];
        rs.push(Route { model: "a".into(), provider: "p1".into() });
        let r = Router::new(rs);
        assert_eq!(r.route("a").unwrap().provider, "p1");
        assert_eq!(r.route("q").unwrap().provider, "p0");
    }

    #[test]
    fn no_fallback_returns_none() {
        let r = Router::new(vec![Route { model: "a".into(), provider: "p1".into() }]);
        assert!(r.route("zzz").is_none());
    }

    #[test]
    fn context_suffix_variants_match() {
        let base = Router::new(vec![Route { model: "deepseek-v4-flash".into(), provider: "p1".into() }]);
        assert_eq!(base.route("deepseek-v4-flash[1M]").unwrap().provider, "p1");

        let suffixed = Router::new(vec![Route { model: "deepseek-v4-pro[1M]".into(), provider: "p2".into() }]);
        assert_eq!(suffixed.route("deepseek-v4-pro").unwrap().provider, "p2");
    }
}
